import os
os.environ["PYTORCH_ENABLE_META_TENSOR"] = "0"
os.environ["PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION"] = "python"
import re
import sys
import traceback
from pathlib import Path
from operator import itemgetter

try:
    import pysqlite3
    sys.modules["sqlite3"] = pysqlite3
except ModuleNotFoundError:
    import sqlite3  # noqa: F401

import streamlit as st
from langchain_community.vectorstores import Chroma

try:
    from langchain_groq import ChatGroq
except ImportError:
    ChatGroq = None

from langchain_huggingface import ChatHuggingFace, HuggingFaceEmbeddings

try:
    from langchain_openai import ChatOpenAI
except ImportError:
    ChatOpenAI = None

try:
    from langchain_anthropic import ChatAnthropic
except ImportError:
    ChatAnthropic = None

try:
    from langchain_perplexity import ChatPerplexity
except ImportError:
    ChatPerplexity = None

os.environ["PYTORCH_ENABLE_META_TENSOR"] = "0"

BASE_DIR = Path(__file__).resolve().parent


def find_week_configs(root: Path):
    week_configs = []

    for repo_path in sorted(root.iterdir()):
        if not repo_path.is_dir():
            continue

        sample_questions_path = repo_path / "SAMPLE_QUESTIONS.md"
        if not sample_questions_path.exists():
            continue

        persist_path = None
        for child in sorted(repo_path.iterdir()):
            if child.is_dir():
                if (child / "chroma.sqlite3").exists():
                    persist_path = child
                    break
                # look one level deeper too
                for subchild in sorted(child.iterdir()):
                    if subchild.is_dir() and (subchild / "chroma.sqlite3").exists():
                        persist_path = subchild
                        break
                if persist_path:
                    break

        if persist_path is None:
            continue

        label = make_week_label(repo_path.name, persist_path.name)
        week_configs.append(
            {
                "key": f"{repo_path.name}::{persist_path.name}",
                "repo_path": repo_path,
                "persist_path": persist_path,
                "sample_questions_path": sample_questions_path,
                "label": label,
            }
        )

    return week_configs


def make_week_label(repo_name: str, persist_name: str) -> str:
    candidate = None
    match = re.match(r"Week[_\s]*(\d+)(?:[_\s]*(.+))?", persist_name, flags=re.IGNORECASE)
    if match:
        number = match.group(1)
        suffix = match.group(2) or ""
        candidate = f"Week {number}"
        if suffix:
            candidate += f" — {suffix.replace('_', ' ')}"
    else:
        match = re.search(r"Week[_\s]*(\d+)", repo_name, flags=re.IGNORECASE)
        if match:
            candidate = f"Week {match.group(1)} — {repo_name}"

    return candidate or repo_name


def extract_sample_questions(markdown_text: str):
    questions = []
    for line in markdown_text.splitlines():
        line = line.strip()
        if not line:
            continue

        # Prefer bold quoted questions first
        bold_quoted = re.findall(r"\*\*\"(.*?)\"\*\*", line)
        if bold_quoted:
            questions.extend(bold_quoted)
            continue

        # Plain quoted lines
        quoted = re.findall(r"\"(.*?)\"", line)
        if quoted and len(quoted[0].strip()) > 10:
            questions.extend([q.strip() for q in quoted])
            continue

        # Lines with a question mark and a natural question style
        if line.endswith("?") and len(line) > 40:
            questions.append(line)

    normalized = []
    for q in questions:
        q = q.strip()
        if q and q not in normalized:
            normalized.append(q)

    return normalized


def load_sample_questions(path: Path):
    try:
        text = path.read_text(encoding="utf-8")
    except Exception:
        return []
    return extract_sample_questions(text)


def initialize_model(provider: str, api_key: str, model_name: str):
    if not api_key:
        return None, "No API key provided."

    if provider == "OpenAI" and api_key.startswith("sk-"):
        return ChatOpenAI(api_key=api_key, model=model_name or "gpt-4o-mini", temperature=0.7), None

    if provider == "Groq":
        return ChatGroq(groq_api_key=api_key, model_name=model_name or "llama-3.1-8b-instant", temperature=0.7), None

    if provider == "Hugging Face":
        return ChatHuggingFace(huggingfacehub_api_token=api_key, repo_id=model_name or "HuggingFaceH4/zephyr-7b-beta", temperature=0.7), None

    if provider == "Anthropic" and api_key.startswith("sk-ant-"):
        return ChatAnthropic(anthropic_api_key=api_key, model_name=model_name or "claude-3-haiku-20240307", temperature=0.7), None

    if provider == "Perplexity" and api_key.startswith("pplx-"):
        return ChatPerplexity(api_key=api_key, model_name=model_name or "sonar-pro", temperature=0.7), None

    return None, "Unsupported provider or invalid API key format."


def build_prompt(context, question, week_label):
    context_text = "\n".join([doc.page_content for doc in context["texts"]])
    return f"""
Role: You are a helpful assistant for advanced undergraduate students taking the Digital and AI Strategy course.
Instructions:
1. Answer using only the provided context from the selected week.
2. Be concise, polite, and encourage learning.
3. If the question is not covered in this week's content, say so clearly.
4. Suggest additional research only if the user wants it.
5. Do not invent citations, and do not fabricate facts.
Context (Week: {week_label}):
{context_text}

Question: {question}
"""


def get_week_description(week_config):
    lines = [f"**Week data source:** `{week_config['persist_path'].as_posix()}`"]
    if week_config["sample_questions_path"].exists():
        lines.append(f"**Sample questions file:** `{week_config['sample_questions_path'].name}`")
    return "\n\n".join(lines)


def main():
    st.set_page_config(page_title="Weekly RAG Chatbot", layout="wide")
    st.title("Weekly Digital AI Strategy Chatbot")
    st.markdown(
        "Use the week selector to switch the vector database and sample questions for the selected session. "
        "You can add new week folders under `On GitHub/` and they will appear automatically if they include `SAMPLE_QUESTIONS.md` and a Chroma DB folder."
    )

    week_configs = find_week_configs(BASE_DIR)
    if not week_configs:
        st.error("No weekly configurations were found in this folder. Make sure each week folder includes SAMPLE_QUESTIONS.md and a Chroma DB folder with chroma.sqlite3.")
        return

    week_labels = [config["label"] for config in week_configs]
    selected_label = st.sidebar.selectbox("Select week", week_labels)
    selected_week = next(config for config in week_configs if config["label"] == selected_label)

    # Reset conversation if week changes
    if st.session_state.get("current_week") != selected_week["key"]:
        st.session_state.current_week = selected_week["key"]
        st.session_state.messages = []
        st.session_state.sample_question = None

    st.sidebar.markdown("---")
    provider = st.sidebar.selectbox("Choose LLM Provider", ("OpenAI", "Groq", "Hugging Face", "Anthropic", "Perplexity"))
    api_key = st.sidebar.text_input(f"{provider} API Key", type="password")
    model_name = st.sidebar.text_input("Model name (optional)", "")
    st.sidebar.markdown(get_week_description(selected_week))

    sample_questions = load_sample_questions(selected_week["sample_questions_path"])
    if sample_questions:
        with st.expander("💡 Sample Questions", expanded=False):
            st.markdown("### Quick question starters")
            cols = st.columns(2)
            for index, question in enumerate(sample_questions[:6]):
                col = cols[index % 2]
                if col.button(question, key=f"sample_{selected_week['key']}_{index}"):
                    st.session_state.sample_question = question
            if len(sample_questions) > 6:
                st.markdown("---")
                st.markdown("### All extracted sample questions")
                for question in sample_questions:
                    st.write(f"- {question}")
    else:
        st.warning("No sample questions could be extracted from the markdown file.")

    if "messages" not in st.session_state:
        st.session_state.messages = []

    for msg in st.session_state.messages:
        st.chat_message(msg["role"]).write(msg["content"])

    model, error_message = initialize_model(provider, api_key, model_name)
    if error_message:
        st.sidebar.error(error_message)

    if model:
        try:
            embedding_model = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
            vectorstore = Chroma(persist_directory=str(selected_week["persist_path"]), embedding_function=embedding_model)

            def run_similarity_search(query):
                return vectorstore.similarity_search(query, k=5)

            pending_question = None
            if st.session_state.sample_question:
                pending_question = st.session_state.sample_question
                st.session_state.sample_question = None

            user_input = st.chat_input("Ask a question...")
            if user_input:
                pending_question = user_input

            if pending_question:
                st.session_state.messages.append({"role": "user", "content": pending_question})
                st.chat_message("user").write(pending_question)

                try:
                    docs = run_similarity_search(pending_question)
                    prompt_text = build_prompt({"texts": docs}, pending_question, selected_week["label"])
                    if hasattr(model, "predict"):
                        answer = model.predict(prompt_text)
                    else:
                        answer = model(prompt_text)
                    st.session_state.messages.append({"role": "assistant", "content": answer})
                    st.chat_message("assistant").write(answer)
                except Exception as exc:
                    st.error(f"Error running RAG chain: {exc}")
                    st.error(traceback.format_exc())
        except Exception as exc:
            st.error(f"Error initializing the week vector store: {exc}")
            st.error(traceback.format_exc())
    else:
        if st.session_state.sample_question:
            st.info(f"You selected: '{st.session_state.sample_question}' — enter your API key above to get an answer.")
        st.warning("Enter a valid API key and choose a provider.", icon="⚠")


if __name__ == "__main__":
    main()

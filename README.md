# Digital_AI_Strategy

# Weekly RAG Chatbot Unified App

This folder contains a unified Streamlit app that lets users select one of the weekly Digital AI Strategy chatbots and loads the corresponding Chroma vector database and sample questions.

## Files

- `weekly_rag_chatbot.py` - unified Streamlit entrypoint
- `requirements.txt` - Python dependencies for running the unified app

## How it works

The app automatically discovers weekly folders under this directory if they contain:

- `SAMPLE_QUESTIONS.md`
- a nested folder with `chroma.sqlite3`

When a week is selected, the app loads that week's vector store and displays sample questions extracted from the markdown file.

## Run the app

1. Install dependencies:

```bash
pip install -r requirements.txt
```

2. Start the app from the `On GitHub/` folder:

```bash
streamlit run weekly_rag_chatbot.py
```

3. In the sidebar:

- select the desired week
- choose an LLM provider
- enter the provider API key
- optionally provide a model name

4. Use the sample questions or type your own query.

## Adding future weeks

To add a new week, create a folder under `On GitHub/` containing:

- `SAMPLE_QUESTIONS.md`
- a folder with the Chroma database file `chroma.sqlite3`

The new week will appear automatically in the selector.

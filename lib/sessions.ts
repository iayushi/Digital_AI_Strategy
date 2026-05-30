export interface SampleQuestion {
  label: string;
  question: string;
}

export interface Session {
  week: number;
  title: string;
  sampleQuestions: SampleQuestion[];
}

export const SESSIONS: Session[] = [
  {
    week: 1,
    title: "Week 1 · Foundations of IS, IT, Digital Platform, AI & Business Strategy",
    sampleQuestions: [
      { label: "🎭 Marvel Fan Explanation", question: "How are the contents of this session related to Digital Platform, AI, and Business Strategy? Explain to a Marvel fan." },
      { label: "🌍 Black Panther & IT", question: "If advanced IT like GenAI was available only to residents of Wakanda, would it matter or not?" },
      { label: "👶 Explain to a 5-year-old", question: "Explain the learnings from this session to a five year old." },
      { label: "🦸 Superhero IT Powers", question: "If any IT was a superpower, what could happen to challenge this superpower?" },
      { label: "🧱 LEGO Masterpiece", question: "Compare Digital and AI Strategy, based on this session's readings, to building a LEGO masterpiece." },
      { label: "🎮 Video Game Platforms", question: "How would you explain value generation from IT to someone who loves video games?" },
    ],
  },
  {
    week: 2,
    title: "Week 2 · Contemporary Digital Technologies: AI, Chatbot, NLP",
    sampleQuestions: [
      { label: "📚 Session Overview", question: "What can I learn from this session for the overall Digital and AI Strategy course?" },
      { label: "🤝 Human-AI Partnership", question: "In the collaboration between MD Anderson's doctors and IBM Watson, what were the biggest challenges to the human-AI team?" },
      { label: "👶 Explain to a 13-year-old", question: "Explain the learnings from this session to a thirteen year old." },
      { label: "🦸 Watson's Kryptonite", question: "If IBM Watson's cognitive computing was a superpower, what would be its kryptonite?" },
      { label: "📋 Watson Oncology Failure", question: "What were the key factors that led to the failure of the IBM Watson for Oncology project at MD Anderson, and what broader lessons does this offer for AI adoption in high-stakes industries?" },
      { label: "💻 Technical Concepts", question: "What are the technical concepts covered in this case? Explain in simple terms too." },
    ],
  },
  {
    week: 3,
    title: "Week 3 · Business Process Analysis & Digital and AI Value Analysis",
    sampleQuestions: [
      { label: "📊 Cases & Key Learnings", question: "What organisations are used as examples in this session, and for what key learnings? Present as a table." },
      { label: "🤔 What Is Strategy?", question: "What is strategy? What is the difference between digital and AI strategy?" },
      { label: "👶 BPR vs BPI (Baking Analogy)", question: "Explain the difference between BPR (tossing out the old recipe) and BPI (tweaking the old recipe) to a five-year-old using a baking analogy." },
      { label: "📝 Session Summary", question: "Please summarise all the content in this session using bullet points and tables." },
      { label: "✈️ ATC Tower Case", question: "Use the COVID-19 test booking example or the digital ATC tower case to explain the key concepts and lessons of this session." },
      { label: "🛠️ AI: Tool or Distraction?", question: "How do you decide if AI is a necessary new tool for your business, or just a costly distraction?" },
    ],
  },
  {
    week: 4,
    title: "Week 4 · Competitive Landscape Analysis & Digital and AI Strategy",
    sampleQuestions: [
      { label: "⚔️ Star Wars & Porter's Forces", question: "If Generative AI is like the rise of the Dark Side in Star Wars, which of Porter's Five Forces represents the Rebellion trying to maintain equilibrium, and why?" },
      { label: "♟️ Chess Master vs Algorithm", question: "Compare the challenge of developing a competitive Digital Strategy to a game of chess. How does GenAI change the rules of the game?" },
      { label: "👶 Threat of Substitutes for Teens", question: "Explain the Threat of Substitutes force, using the rise of Generative AI, in terms a high-school student would understand." },
      { label: "💡 GenAI Challenges (Simple)", question: "Summarise the three core challenges companies face when moving to a high level of Generative AI adoption in one simple sentence each." },
      { label: "🛑 Cold Call: Industry Rivalry", question: "You are cold-called: 'How does AI implementation increase the intensity of rivalry among existing competitors, and how can a firm use a digital strategy to counter this?'" },
      { label: "💼 Cold Call: Bargaining Power", question: "You are cold-called: 'Identify a scenario where Generative AI shifts the Bargaining Power of Suppliers in a major industry, and explain the mechanism of this shift.'" },
    ],
  },
  {
    week: 5,
    title: "Week 5 · New Business Models & Platform Strategy",
    sampleQuestions: [
      { label: "🔄 Product-to-Platform", question: "What are the three main methods for transforming a product into a platform, and can you give one real-world example for each?" },
      { label: "🔗 Network Effects (Simply)", question: "How do network effects work in platform-based business models, and why do they lead to exponential growth and defensibility?" },
      { label: "🦇 Batman's Risk Management", question: "The decision to let third-party developers on a platform is like a superhero trusting a new ally. What are the key risks when inviting third-party sellers or developers, and what governance measures can mitigate them?" },
      { label: "🧬 X-Men: Connecting vs Reaching Out", question: "The 'Connecting customers' strategy is like Professor X linking minds, while 'Reaching out to customers' is like a global outreach mission. How do these strategies differ, and what are the benefits and challenges of each?" },
      { label: "⚙️ Cold Call: LEGO's IT Backbone", question: "You are cold-called: 'What IT capabilities are critical for enabling transactions in a platform model like LEGO's Bricklink or a marketplace model? Cite 3 specific examples.'" },
    ],
  },
  {
    week: 7,
    title: "Week 7 · Digital and AI Strategy Implementation",
    sampleQuestions: [
      { label: "🏗️ 10-Block Framework", question: "What is the primary purpose of the 10-building-block Digital Strategy Implementation Framework, and which three blocks are most critical?" },
      { label: "⭐ Star Model™ (Simply)", question: "What are the five points of Jay R. Galbraith's Star Model™ for organisational design, and which two elements typically present the greatest challenge during a digital transformation?" },
      { label: "📡 Vodafone's Automation Strategy", question: "Vodafone's primary goal is to 'Automate and improve customer care.' What are the three most critical data and IT infrastructure capabilities required to achieve high-level automation in customer service, and how do the 10 building blocks of the framework apply?" },
      { label: "🏭 ABB vs CNH Goals", question: "ABB's goal is to create 'continuous value' through software-enabled services, while CNH Industrial focuses on 'predictive maintenance and intelligent logistics.' How do these different goals influence scope, investment, and timeline for their digital transformations?" },
      { label: "🛑 Cold Call: Star Model™ Alignment", question: "You are cold-called: 'If a company introduces a new digital product (Strategy) but its IT department (Structure) is siloed, which other two elements of the Star Model™ must be urgently realigned to avoid failure? Justify with a real-world example.'" },
      { label: "📈 Digital Maturity Metrics", question: "The 10-Step Framework emphasises metrics. What KPI measures operational effectiveness in a digital transformation, and how does it differ from a KPI that measures customer value creation?" },
    ],
  },
];

export const DEFAULT_WEEK = 1;

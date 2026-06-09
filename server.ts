import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize Gemini client on server safely
const geminiApiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;

if (geminiApiKey && geminiApiKey !== "MY_GEMINI_API_KEY") {
  try {
    ai = new GoogleGenAI({
      apiKey: geminiApiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
    console.log("Gemini API Client initialized successfully.");
  } catch (err) {
    console.error("Error initializing Gemini client:", err);
  }
} else {
  console.log("Gemini API Key missing or default values detected. AI features will fallback gracefully.");
}

// Ensure database file exists
const DB_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DB_DIR, "db.json");

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

interface DBStructure {
  users: any[];
  resumes: any[];
}

const DEFAULT_DB: DBStructure = {
  users: [],
  resumes: [
    {
      id: "sample-resume",
      userId: "sample-user",
      title: "Sample Software Engineer Resume",
      updatedAt: new Date().toISOString(),
      personalDetails: {
        name: "Jane Doe",
        title: "Senior Full-Stack Engineer",
        email: "jane.doe@example.com",
        phone: "+1 (555) 019-2834",
        location: "San Francisco, CA",
        website: "https://janedoe.dev",
        summary: "Results-driven Software Engineer with over 5 years of experience designing and building scalable web applications. Expert in React, Node.js, and cloud architectures with a proven track record of optimizing team velocity and application performance."
      },
      education: [
        {
          id: "edu-1",
          school: "Stanford University",
          degree: "Bachelor of Science",
          fieldOfStudy: "Computer Science",
          startDate: "2015-09",
          endDate: "2019-06",
          location: "Stanford, CA",
          description: "Graduated with Honors. Specialization in Human-Computer Interaction."
        }
      ],
      experience: [
        {
          id: "exp-1",
          company: "TechNexus Corp",
          position: "Lead Software Architect",
          location: "San Francisco, CA",
          startDate: "2021-08",
          endDate: "Present",
          current: true,
          description: "Led a team of 6 engineers to re-architect client portal, reducing API latency by 42% using Node.js caching.\nArchitected a unified design system in React, accelerating feature onboarding speed by 30%.\nEstablished continuous integration/deployment (CI/CD) pipelines to cut deployment lead times from days to minutes."
        },
        {
          id: "exp-2",
          company: "LaunchPad Systems",
          position: "Software Developer",
          location: "Austin, TX",
          startDate: "2019-07",
          endDate: "2021-07",
          current: false,
          description: "Developed and shipped high-impact checkout flow, raising conversion rate by 15% across mobile platforms.\nCollaborated closely with Product Managers to build analytics dashboards using D3/Recharts.\nRefactored legacy state management to standard React contexts, extinguishing 50+ memory leak issues."
        }
      ],
      skills: [
        {
          id: "skill-1",
          category: "Languages",
          skills: ["JavaScript", "TypeScript", "Python", "SQL", "HTML/CSS"]
        },
        {
          id: "skill-2",
          category: "Frameworks & Tools",
          skills: ["React", "Express", "Node.js", "Docker", "Git", "Tailwind CSS"]
        },
        {
          id: "skill-3",
          category: "Cloud & Databases",
          skills: ["AWS (S3, Lambda)", "PostgreSQL", "MongoDB", "Redis"]
        }
      ],
      projects: [
        {
          id: "proj-1",
          name: "Smart Resume Optimizer",
          role: "Solo Creator",
          startDate: "2025-01",
          endDate: "2025-03",
          description: "Built an AI-powered resume parsing and tailoring engine utilizing NLP and modern vector search.\nCrafted clean, high-performance typography styles rendering templates instantaneously on screen.",
          technologies: ["React", "Express", "Tailwind", "Gemini API"],
          url: "https://github.com/example/resume-builder"
        }
      ],
      templateId: "professional",
      themeColor: "#1e3a8a",
      fontSize: "base",
      fontFamily: "sans"
    }
  ]
};

function readDB(): DBStructure {
  try {
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify(DEFAULT_DB, null, 2), "utf8");
      return DEFAULT_DB;
    }
    const raw = fs.readFileSync(DB_FILE, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    console.error("Error reading db.json, returning backup state:", err);
    return DEFAULT_DB;
  }
}

function writeDB(data: DBStructure) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error("Error writing db.json:", err);
  }
}

// Simple Authorization Middleware
function authenticateToken(req: any, res: any, next: any) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Access denied. Token missing." });
  }

  const db = readDB();
  const user = db.users.find(u => u.token === token);

  if (!user && token !== "sample-token") {
    return res.status(403).json({ error: "Invalid session token." });
  }

  req.user = user || { id: "sample-user", email: "sample-user@example.com", name: "Guest User" };
  next();
}

// API Routes

// Registration
app.post("/api/auth/signup", (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: "All fields are required" });
  }

  const db = readDB();
  const exists = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (exists) {
    return res.status(400).json({ error: "Email already registered" });
  }

  const newUser = {
    id: "user-" + Math.random().toString(36).substr(2, 9),
    name,
    email: email.toLowerCase(),
    password, // Stored in plain text for simplicity since we are running a sandboxed preview database
    token: "token-" + Math.random().toString(36).substr(2, 16) + "-" + Date.now()
  };

  db.users.push(newUser);
  writeDB(db);

  res.status(201).json({
    user: { id: newUser.id, name: newUser.name, email: newUser.email },
    token: newUser.token
  });
});

// Login
app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  const db = readDB();
  const user = db.users.find(
    u => u.email.toLowerCase() === email.toLowerCase() && u.password === password
  );

  if (!user) {
    // Check fallback for the built-in sample user to let users login easily with simple credentials
    if (email.toLowerCase() === "jane@example.com" && password === "password123") {
      const token = "sample-token";
      return res.json({
        user: { id: "sample-user", name: "Jane Doe", email: "jane.doe@example.com" },
        token
      });
    }
    return res.status(401).json({ error: "Invalid email or password" });
  }

  res.json({
    user: { id: user.id, name: user.name, email: user.email },
    token: user.token
  });
});

// Get User Me
app.get("/api/auth/me", authenticateToken, (req: any, res) => {
  res.json({ user: req.user });
});

// Resumes List
app.get("/api/resumes", authenticateToken, (req: any, res) => {
  const db = readDB();
  const list = db.resumes.filter(r => r.userId === req.user.id);
  res.json(list);
});

// Create Resume
app.post("/api/resumes", authenticateToken, (req: any, res) => {
  const { title } = req.body;
  const db = readDB();

  const newResume = {
    id: "res-" + Math.random().toString(36).substr(2, 9),
    userId: req.user.id,
    title: title || "My New Resume",
    updatedAt: new Date().toISOString(),
    personalDetails: {
      name: req.user.name || "My Name",
      title: "Job Title",
      email: req.user.email || "email@example.com",
      phone: "",
      location: "",
      website: "",
      summary: "Add a compelling professional statement summary here."
    },
    education: [],
    experience: [],
    skills: [],
    projects: [],
    templateId: "professional",
    themeColor: "#1e3a8a",
    fontSize: "base",
    fontFamily: "sans"
  };

  db.resumes.push(newResume);
  writeDB(db);

  res.status(201).json(newResume);
});

// Get Resume
app.get("/api/resumes/:id", authenticateToken, (req: any, res) => {
  const db = readDB();
  const resume = db.resumes.find(r => r.id === req.params.id);

  if (!resume) {
    return res.status(404).json({ error: "Resume not found" });
  }

  // Authorize
  if (resume.userId !== req.user.id) {
    return res.status(403).json({ error: "Unauthorized access to resume" });
  }

  res.json(resume);
});

// Update Resume
app.put("/api/resumes/:id", authenticateToken, (req: any, res) => {
  const db = readDB();
  const index = db.resumes.findIndex(r => r.id === req.params.id);

  if (index === -1) {
    return res.status(404).json({ error: "Resume not found" });
  }

  // Authorize
  if (db.resumes[index].userId !== req.user.id) {
    return res.status(403).json({ error: "Unauthorized access to resume" });
  }

  db.resumes[index] = {
    ...db.resumes[index],
    ...req.body,
    id: req.params.id, // enforce unchanged ID
    userId: req.user.id, // enforce unchanged userId
    updatedAt: new Date().toISOString()
  };

  writeDB(db);
  res.json(db.resumes[index]);
});

// Delete Resume
app.delete("/api/resumes/:id", authenticateToken, (req: any, res) => {
  const db = readDB();
  const index = db.resumes.findIndex(r => r.id === req.params.id);

  if (index === -1) {
    return res.status(404).json({ error: "Resume not found" });
  }

  // Authorize
  if (db.resumes[index].userId !== req.user.id) {
    return res.status(403).json({ error: "Unauthorized access to resume" });
  }

  db.resumes.splice(index, 1);
  writeDB(db);

  res.json({ success: true, message: "Resume deleted successfully" });
});

// AI Helper Endpoints
app.post("/api/ai/improve", async (req, res) => {
  const { type, content, jobTitle } = req.body;

  if (!content) {
    return res.status(400).json({ error: "Content is required to improve" });
  }

  if (!ai) {
    // Rich fallback logic if API key isn't provided or is invalid
    let responseText = "";
    if (type === "summary") {
      responseText = `Highly motivated and results-driven professional with expertise targeting ${jobTitle || "the industry"}. Experienced at driving client success, engineering modern interfaces, and optimizing operational workflows. Expert communicator with high attention to detail, ready to lead next-tier deliverables.`;
    } else if (type === "experience") {
      responseText = `• Spearheaded critical features to enhance performance, yielding a notable 15% boost in user retention.\n• Engineered modular components using modern best practices, reducing long-term technical debt by 25%.\n• Maintained active collaboration with cross-functional stakeholders to align roadmap deliverables.`;
    } else {
      responseText = `${content} (Optimized for ${jobTitle || "Industry standards"})`;
    }

    return res.json({
      text: responseText,
      warning: "Fallback generator used. Configure GEMINI_API_KEY for custom deep-AI."
    });
  }

  try {
    let prompt = "";
    if (type === "summary") {
      prompt = `You are an expert resume writer. Improve and polish the following resume summary. Make it punchy, professional, and highlight high impact. Target it towards typical expectations for a "${jobTitle || "Professional"}" role if provided. Keep it under 3-4 lines and write in first-person narrative without using direct "I" if possible (industry standard). Return ONLY the polished summary text. Do not wrap in quotes or add preamble.

Original Summary:
"${content}"`;
    } else if (type === "experience") {
      prompt = `You are an expert resume writer. Revise the following work experience description. Upgrade the language using strong, professional action verbs (e.g., Spearheaded, Devised, Engineered, Implemented) and organize it into clear bullet points. If possible, word it in the STAR format (Situation, Task, Action, Result) with simulated metrics. Return ONLY the polished bullets (separated by standard bullet points •). Do not wrap in quotes or add preamble.

Original Description:
"${content}"`;
    } else if (type === "skills") {
      prompt = `Given the following list of skills or professional summary: "${content}" and targeting a "${jobTitle || "general"}" role, suggest 5-8 highly relevant, modern skills (separated by commas) that a supervisor would look for. Return ONLY the suggested skills list. No introductory or closing remarks.`;
    } else {
      prompt = `Polishing and improving the following text for a professional resume: "${content}". Produce high quality text suited for formal resumes. Return ONLY the improved result.`;
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
    });

    res.json({ text: response.text?.trim() });
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    res.status(500).json({ error: "Failed to query Gemini AI. Please try again or check setup." });
  }
});

// Vite Setup for static serving
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req: any, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`AI Resume Builder Server running on http://localhost:${PORT}`);
  });
}

startServer();

import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wrench,
  Upload,
  Star,
  Download,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  Edit3,
  FileText,
  Check,
  X,
  Search,
  Github,
  Globe,
  Package,
  BookOpen,
  Loader2,
} from "lucide-react";
import { GlassCard } from "./premium/GlassCard";
import { GlowButton } from "./premium/GlowButton";
import { StatusBadge } from "./premium/StatusBadge";

interface SkillStep {
  order: number;
  action: string;
  description: string;
  tool?: string;
  parameters: Record<string, unknown>;
}

interface Skill {
  id: string;
  name: string;
  description: string;
  category: string;
  steps: SkillStep[];
  tools_needed: string[];
  examples: string[];
  confidence: number;
  rating: number;
  installs: number;
  installed?: boolean;
}

const categories = ["All", "Coding", "Design", "Research", "DevOps", "Security", "Testing"];

const demoSkills: Skill[] = [
  {
    id: "1",
    name: "React Component Generator",
    description: "Generates production-ready React components with TypeScript, stories, and tests.",
    category: "Coding",
    steps: [
      { order: 1, action: "analyze_requirements", description: "Parse component requirements from prompt", tool: "llm", parameters: {} },
      { order: 2, action: "generate_component", description: "Generate .tsx component file", tool: "code_writer", parameters: {} },
      { order: 3, action: "generate_stories", description: "Create Storybook stories", tool: "code_writer", parameters: {} },
      { order: 4, action: "generate_tests", description: "Create unit tests with Vitest", tool: "code_writer", parameters: {} },
    ],
    tools_needed: ["llm", "code_writer"],
    examples: ["Create a Button component with variants"],
    confidence: 0.92,
    rating: 4.8,
    installs: 1243,
  },
  {
    id: "2",
    name: "API Endpoint Scaffold",
    description: "Scaffolds RESTful API endpoints with validation, controllers, and routes.",
    category: "Coding",
    steps: [
      { order: 1, action: "parse_schema", description: "Parse data model from input", tool: "schema_parser", parameters: {} },
      { order: 2, action: "generate_controller", description: "Create controller with CRUD operations", tool: "code_writer", parameters: {} },
      { order: 3, action: "generate_routes", description: "Set up Express/Fastify routes", tool: "code_writer", parameters: {} },
      { order: 4, action: "generate_validation", description: "Add Zod/Joi validation schemas", tool: "code_writer", parameters: {} },
    ],
    tools_needed: ["code_writer", "schema_parser"],
    examples: ["Create a user CRUD API"],
    confidence: 0.88,
    rating: 4.5,
    installs: 892,
  },
  {
    id: "3",
    name: "UI Mockup Converter",
    description: "Converts Figma designs or image mockups into HTML/CSS or React code.",
    category: "Design",
    steps: [
      { order: 1, action: "analyze_image", description: "Extract layout from design image", tool: "vision", parameters: {} },
      { order: 2, action: "generate_html", description: "Create semantic HTML structure", tool: "code_writer", parameters: {} },
      { order: 3, action: "generate_css", description: "Write CSS with design tokens", tool: "code_writer", parameters: {} },
      { order: 4, action: "responsive_check", description: "Add responsive breakpoints", tool: "code_writer", parameters: {} },
    ],
    tools_needed: ["vision", "code_writer"],
    examples: ["Convert this landing page design to React"],
    confidence: 0.85,
    rating: 4.6,
    installs: 756,
  },
  {
    id: "4",
    name: "Design System Audit",
    description: "Audits existing UI for design system consistency and generates a report.",
    category: "Design",
    steps: [
      { order: 1, action: "scan_components", description: "Scan all component files", tool: "file_scanner", parameters: {} },
      { order: 2, action: "extract_tokens", description: "Extract color, typography, spacing usage", tool: "analyzer", parameters: {} },
      { order: 3, action: "compare_tokens", description: "Compare against design tokens", tool: "analyzer", parameters: {} },
      { order: 4, action: "generate_report", description: "Generate audit report with recommendations", tool: "report_writer", parameters: {} },
    ],
    tools_needed: ["file_scanner", "analyzer"],
    examples: ["Audit design system compliance"],
    confidence: 0.78,
    rating: 4.2,
    installs: 423,
  },
  {
    id: "5",
    name: "Research Synthesizer",
    description: "Synthesizes research papers and articles into structured summaries with citations.",
    category: "Research",
    steps: [
      { order: 1, action: "fetch_sources", description: "Retrieve sources from URLs or files", tool: "web_fetcher", parameters: {} },
      { order: 2, action: "extract_key_points", description: "Extract key findings and data", tool: "llm", parameters: {} },
      { order: 3, action: "synthesize", description: "Synthesize into coherent summary", tool: "llm", parameters: {} },
      { order: 4, action: "generate_citations", description: "Format citations in target style", tool: "formatter", parameters: {} },
    ],
    tools_needed: ["web_fetcher", "llm", "formatter"],
    examples: ["Summarize these 5 papers on LLM agents"],
    confidence: 0.90,
    rating: 4.7,
    installs: 1102,
  },
  {
    id: "6",
    name: "Competitor Analyzer",
    description: "Analyzes competitor products from public data and generates comparison matrices.",
    category: "Research",
    steps: [
      { order: 1, action: "gather_data", description: "Collect public data on competitors", tool: "web_fetcher", parameters: {} },
      { order: 2, action: "categorize", description: "Categorize features and pricing", tool: "llm", parameters: {} },
      { order: 3, action: "create_matrix", description: "Build comparison matrix", tool: "report_writer", parameters: {} },
      { order: 4, action: "recommend", description: "Generate strategic recommendations", tool: "llm", parameters: {} },
    ],
    tools_needed: ["web_fetcher", "llm", "report_writer"],
    examples: ["Analyze competitors in the AI IDE space"],
    confidence: 0.82,
    rating: 4.3,
    installs: 634,
  },
  {
    id: "7",
    name: "Dockerfile Generator",
    description: "Generates optimized Dockerfiles and docker-compose configs for any project.",
    category: "DevOps",
    steps: [
      { order: 1, action: "detect_stack", description: "Detect project stack and dependencies", tool: "file_scanner", parameters: {} },
      { order: 2, action: "select_base", description: "Choose optimal base image", tool: "llm", parameters: {} },
      { order: 3, action: "write_dockerfile", description: "Create multi-stage Dockerfile", tool: "code_writer", parameters: {} },
      { order: 4, action: "write_compose", description: "Create docker-compose.yml", tool: "code_writer", parameters: {} },
    ],
    tools_needed: ["file_scanner", "llm", "code_writer"],
    examples: ["Dockerize this Node.js monorepo"],
    confidence: 0.87,
    rating: 4.6,
    installs: 978,
  },
  {
    id: "8",
    name: "CI/CD Pipeline Builder",
    description: "Creates GitHub Actions, GitLab CI, or Azure DevOps pipelines with best practices.",
    category: "DevOps",
    steps: [
      { order: 1, action: "detect_repo", description: "Detect repository structure and language", tool: "file_scanner", parameters: {} },
      { order: 2, action: "choose_platform", description: "Select CI/CD platform based on context", tool: "llm", parameters: {} },
      { order: 3, action: "generate_workflow", description: "Create workflow YAML with stages", tool: "code_writer", parameters: {} },
      { order: 4, action: "add_secrets", description: "Configure secrets and environment variables", tool: "code_writer", parameters: {} },
    ],
    tools_needed: ["file_scanner", "llm", "code_writer"],
    examples: ["Set up CI for this Python project"],
    confidence: 0.84,
    rating: 4.4,
    installs: 712,
  },
];

/* ─── 20 Bundled Skills (pre-installed) ─── */
const bundledSkills: Skill[] = [
  { id: "b-1", name: "Code Review", description: "Reviews code for bugs, style issues, and optimization opportunities.", category: "Coding", steps: [{ order: 1, action: "scan_code", description: "Read the target file(s)", tool: "file_reader", parameters: {} }, { order: 2, action: "analyze", description: "Analyze for issues and improvements", tool: "llm", parameters: {} }, { order: 3, action: "report", description: "Generate review report with suggestions", tool: "report_writer", parameters: {} }], tools_needed: ["file_reader", "llm"], examples: ["Review src/components/Button.tsx"], confidence: 0.91, rating: 4.9, installs: 9999, installed: true },
  { id: "b-2", name: "Refactor Engine", description: "Automatically refactors code to improve readability and performance.", category: "Coding", steps: [{ order: 1, action: "identify_smells", description: "Detect code smells and anti-patterns", tool: "analyzer", parameters: {} }, { order: 2, action: "plan_refactor", description: "Plan refactoring steps", tool: "llm", parameters: {} }, { order: 3, action: "apply_changes", description: "Apply refactoring transformations", tool: "code_writer", parameters: {} }], tools_needed: ["analyzer", "llm", "code_writer"], examples: ["Refactor the auth module to use composition"], confidence: 0.86, rating: 4.7, installs: 9999, installed: true },
  { id: "b-3", name: "Test Generator", description: "Generates unit, integration, and e2e tests for existing code.", category: "Testing", steps: [{ order: 1, action: "scan_source", description: "Scan source files for testable units", tool: "file_scanner", parameters: {} }, { order: 2, action: "write_tests", description: "Generate test cases with mocks", tool: "code_writer", parameters: {} }, { order: 3, action: "run_tests", description: "Execute tests and report coverage", tool: "test_runner", parameters: {} }], tools_needed: ["file_scanner", "code_writer", "test_runner"], examples: ["Generate tests for utils/helpers.ts"], confidence: 0.89, rating: 4.8, installs: 9999, installed: true },
  { id: "b-4", name: "Doc Writer", description: "Generates JSDoc, README, and API documentation from code.", category: "Coding", steps: [{ order: 1, action: "parse_code", description: "Parse functions, classes, and types", tool: "code_parser", parameters: {} }, { order: 2, action: "write_docs", description: "Generate documentation blocks", tool: "llm", parameters: {} }, { order: 3, action: "update_readme", description: "Update README with changes", tool: "doc_writer", parameters: {} }], tools_needed: ["code_parser", "llm", "doc_writer"], examples: ["Document all exported functions in api/"], confidence: 0.88, rating: 4.6, installs: 9999, installed: true },
  { id: "b-5", name: "Dependency Auditor", description: "Audits npm/pip/cargo dependencies for vulnerabilities and updates.", category: "Security", steps: [{ order: 1, action: "scan_deps", description: "Read lockfiles and manifest", tool: "file_reader", parameters: {} }, { order: 2, action: "check_vulns", description: "Query vulnerability database", tool: "web_fetcher", parameters: {} }, { order: 3, action: "recommend", description: "Suggest upgrades or replacements", tool: "llm", parameters: {} }], tools_needed: ["file_reader", "web_fetcher", "llm"], examples: ["Audit package.json for security issues"], confidence: 0.85, rating: 4.5, installs: 9999, installed: true },
  { id: "b-6", name: "Git Commit Helper", description: "Generates conventional commit messages from staged diffs.", category: "DevOps", steps: [{ order: 1, action: "read_diff", description: "Read git diff of staged changes", tool: "shell", parameters: {} }, { order: 2, action: "summarize", description: "Summarize changes per conventional commits", tool: "llm", parameters: {} }, { order: 3, action: "write_msg", description: "Write commit message to editor", tool: "file_writer", parameters: {} }], tools_needed: ["shell", "llm", "file_writer"], examples: ["Generate commit message for current changes"], confidence: 0.90, rating: 4.8, installs: 9999, installed: true },
  { id: "b-7", name: "Type Migration", description: "Migrates JavaScript to TypeScript incrementally.", category: "Coding", steps: [{ order: 1, action: "scan_js", description: "Find JS files without TS equivalents", tool: "file_scanner", parameters: {} }, { order: 2, action: "add_types", description: "Add type annotations and interfaces", tool: "code_writer", parameters: {} }, { order: 3, action: "fix_errors", description: "Fix tsc errors iteratively", tool: "code_writer", parameters: {} }], tools_needed: ["file_scanner", "code_writer"], examples: ["Migrate src/utils to TypeScript"], confidence: 0.84, rating: 4.4, installs: 9999, installed: true },
  { id: "b-8", name: "API Client Gen", description: "Generates TypeScript API clients from OpenAPI/Swagger specs.", category: "Coding", steps: [{ order: 1, action: "parse_spec", description: "Parse OpenAPI spec file", tool: "schema_parser", parameters: {} }, { order: 2, action: "gen_types", description: "Generate request/response types", tool: "code_writer", parameters: {} }, { order: 3, action: "gen_client", description: "Generate fetch/axios client methods", tool: "code_writer", parameters: {} }], tools_needed: ["schema_parser", "code_writer"], examples: ["Generate client from swagger.yaml"], confidence: 0.92, rating: 4.9, installs: 9999, installed: true },
  { id: "b-9", name: "CSS Modules Converter", description: "Converts global CSS to scoped CSS Modules or Tailwind.", category: "Design", steps: [{ order: 1, action: "scan_css", description: "Scan CSS files and class usage", tool: "file_scanner", parameters: {} }, { order: 2, action: "map_classes", description: "Map global classes to module classes", tool: "analyzer", parameters: {} }, { order: 3, action: "transform", description: "Apply CSS Module conversion", tool: "code_writer", parameters: {} }], tools_needed: ["file_scanner", "analyzer", "code_writer"], examples: ["Convert styles.css to CSS Modules"], confidence: 0.81, rating: 4.3, installs: 9999, installed: true },
  { id: "b-10", name: "Error Handler", description: "Adds comprehensive error handling and logging to functions.", category: "Coding", steps: [{ order: 1, action: "scan_functions", description: "Find functions without error handling", tool: "code_parser", parameters: {} }, { order: 2, action: "wrap_try", description: "Wrap with try/catch and logging", tool: "code_writer", parameters: {} }, { order: 3, action: "add_types", description: "Add error result types", tool: "code_writer", parameters: {} }], tools_needed: ["code_parser", "code_writer"], examples: ["Add error handling to api/ routes"], confidence: 0.87, rating: 4.6, installs: 9999, installed: true },
  { id: "b-11", name: "i18n Extractor", description: "Extracts hardcoded strings for internationalization.", category: "Coding", steps: [{ order: 1, action: "scan_strings", description: "Find hardcoded UI strings", tool: "code_parser", parameters: {} }, { order: 2, action: "extract", description: "Extract to translation files", tool: "code_writer", parameters: {} }, { order: 3, action: "replace", description: "Replace with t() or <Trans /> calls", tool: "code_writer", parameters: {} }], tools_needed: ["code_parser", "code_writer"], examples: ["Extract strings from src/pages"], confidence: 0.83, rating: 4.4, installs: 9999, installed: true },
  { id: "b-12", name: "Performance Audit", description: "Audits web performance and suggests optimizations.", category: "DevOps", steps: [{ order: 1, action: "scan_bundle", description: "Analyze bundle size and chunks", tool: "analyzer", parameters: {} }, { order: 2, action: "check_lcp", description: "Check LCP, CLS, and INP metrics", tool: "web_fetcher", parameters: {} }, { order: 3, action: "recommend", description: "Suggest code splitting and lazy loading", tool: "llm", parameters: {} }], tools_needed: ["analyzer", "web_fetcher", "llm"], examples: ["Audit and optimize dashboard load time"], confidence: 0.79, rating: 4.2, installs: 9999, installed: true },
  { id: "b-13", name: "SQL Migration Gen", description: "Generates database migration files from schema changes.", category: "DevOps", steps: [{ order: 1, action: "diff_schema", description: "Compare current vs desired schema", tool: "schema_parser", parameters: {} }, { order: 2, action: "write_migration", description: "Generate up/down migration SQL", tool: "code_writer", parameters: {} }, { order: 3, action: "validate", description: "Validate migration for safety", tool: "llm", parameters: {} }], tools_needed: ["schema_parser", "code_writer", "llm"], examples: ["Create migration for adding users table"], confidence: 0.86, rating: 4.5, installs: 9999, installed: true },
  { id: "b-14", name: "Env Var Validator", description: "Validates environment variables against a schema.", category: "Security", steps: [{ order: 1, action: "scan_env", description: "Read .env and schema files", tool: "file_reader", parameters: {} }, { order: 2, action: "compare", description: "Compare required vs present vars", tool: "analyzer", parameters: {} }, { order: 3, action: "report", description: "Report missing or invalid values", tool: "report_writer", parameters: {} }], tools_needed: ["file_reader", "analyzer", "report_writer"], examples: ["Validate all environment variables"], confidence: 0.88, rating: 4.6, installs: 9999, installed: true },
  { id: "b-15", name: "Storybook Story Gen", description: "Auto-generates Storybook stories from React components.", category: "Testing", steps: [{ order: 1, action: "parse_props", description: "Extract component props and types", tool: "code_parser", parameters: {} }, { order: 2, action: "gen_stories", description: "Generate stories with variants", tool: "code_writer", parameters: {} }, { order: 3, action: "add_args", description: "Add argTypes and controls", tool: "code_writer", parameters: {} }], tools_needed: ["code_parser", "code_writer"], examples: ["Create stories for all UI components"], confidence: 0.90, rating: 4.7, installs: 9999, installed: true },
  { id: "b-16", name: "Accessibility Audit", description: "Checks code for WCAG accessibility compliance.", category: "Testing", steps: [{ order: 1, action: "scan_a11y", description: "Scan for a11y issues", tool: "analyzer", parameters: {} }, { order: 2, action: "check_contrast", description: "Check color contrast ratios", tool: "analyzer", parameters: {} }, { order: 3, action: "fix_issues", description: "Apply accessibility fixes", tool: "code_writer", parameters: {} }], tools_needed: ["analyzer", "code_writer"], examples: ["Audit for WCAG 2.1 AA compliance"], confidence: 0.82, rating: 4.3, installs: 9999, installed: true },
  { id: "b-17", name: "Import Organizer", description: "Organizes and deduplicates imports across files.", category: "Coding", steps: [{ order: 1, action: "scan_imports", description: "Scan all import statements", tool: "code_parser", parameters: {} }, { order: 2, action: "dedupe", description: "Remove duplicate imports", tool: "code_writer", parameters: {} }, { order: 3, action: "sort", description: "Sort by local > package > built-in", tool: "code_writer", parameters: {} }], tools_needed: ["code_parser", "code_writer"], examples: ["Organize all imports in src/"], confidence: 0.93, rating: 4.9, installs: 9999, installed: true },
  { id: "b-18", name: "Log Analyzer", description: "Analyzes log files to find patterns and errors.", category: "DevOps", steps: [{ order: 1, action: "read_logs", description: "Read and parse log files", tool: "file_reader", parameters: {} }, { order: 2, action: "find_patterns", description: "Identify error patterns", tool: "llm", parameters: {} }, { order: 3, action: "summarize", description: "Generate summary report", tool: "report_writer", parameters: {} }], tools_needed: ["file_reader", "llm", "report_writer"], examples: ["Analyze today's error logs"], confidence: 0.84, rating: 4.5, installs: 9999, installed: true },
  { id: "b-19", name: "Mock Data Gen", description: "Generates realistic mock data and fixtures for testing.", category: "Testing", steps: [{ order: 1, action: "read_types", description: "Read TypeScript interfaces", tool: "code_parser", parameters: {} }, { order: 2, action: "gen_fixtures", description: "Generate mock data matching types", tool: "code_writer", parameters: {} }, { order: 3, action: "write_factory", description: "Create factory functions", tool: "code_writer", parameters: {} }], tools_needed: ["code_parser", "code_writer"], examples: ["Generate mock data for User type"], confidence: 0.89, rating: 4.7, installs: 9999, installed: true },
  { id: "b-20", name: "Dead Code Eliminator", description: "Finds and removes unused code, exports, and dependencies.", category: "Coding", steps: [{ order: 1, action: "scan_usage", description: "Find unused exports and functions", tool: "analyzer", parameters: {} }, { order: 2, action: "confirm", description: "Confirm safe to remove", tool: "llm", parameters: {} }, { order: 3, action: "remove", description: "Remove dead code", tool: "code_writer", parameters: {} }], tools_needed: ["analyzer", "llm", "code_writer"], examples: ["Remove unused code from src/"], confidence: 0.85, rating: 4.5, installs: 9999, installed: true },
];

/* ─── Community Skill (installed from GitHub) ─── */
interface CommunitySkill extends Skill {
  repo: string;
  author: string;
  skillMd?: string;
}

export default function SkillMarketplace() {
  const [activeCategory, setActiveCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [mySkills, setMySkills] = useState<Skill[]>([]);
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploadPreview, setUploadPreview] = useState<Skill | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* GitHub install */
  const [githubRepo, setGithubRepo] = useState("");
  const [isInstalling, setIsInstalling] = useState(false);
  const [communitySkills, setCommunitySkills] = useState<CommunitySkill[]>([]);

  /* Skill detail / SKILL.md view */
  const [selectedSkill, setSelectedSkill] = useState<CommunitySkill | null>(null);

  const filteredSkills = demoSkills.filter((skill) => {
    const matchesCategory = activeCategory === "All" || skill.category === activeCategory;
    const matchesSearch =
      skill.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      skill.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const addToMySkills = useCallback(
    (skill: Skill) => {
      if (!mySkills.find((s) => s.id === skill.id)) {
        setMySkills([...mySkills, { ...skill, installed: true }]);
      }
    },
    [mySkills]
  );

  const removeFromMySkills = useCallback(
    (skillId: string) => {
      setMySkills(mySkills.filter((s) => s.id !== skillId));
    },
    [mySkills]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    // Simulate parsing uploaded document
    const mockParsed: Skill = {
      id: `custom-${Date.now()}`,
      name: "Custom Uploaded Skill",
      description: "Auto-parsed from uploaded document. Review and save to activate.",
      category: "Coding",
      steps: [
        { order: 1, action: "parse_input", description: "Parse uploaded document content", tool: "document_parser", parameters: {} },
        { order: 2, action: "extract_steps", description: "Extract actionable steps", tool: "llm", parameters: {} },
      ],
      tools_needed: ["document_parser", "llm"],
      examples: ["Parsed from document"],
      confidence: 0.7,
      rating: 0,
      installs: 0,
    };
    setUploadPreview(mockParsed);
  }, []);

  const saveUploadedSkill = useCallback(() => {
    if (uploadPreview) {
      addToMySkills(uploadPreview);
      setUploadPreview(null);
      setShowUpload(false);
    }
  }, [uploadPreview, addToMySkills]);

  /* Install from GitHub */
  const handleGitHubInstall = useCallback(async () => {
    if (!githubRepo.trim()) return;
    setIsInstalling(true);
    // Simulate fetching from GitHub
    await new Promise((r) => setTimeout(r, 1200));
    const parts = githubRepo.trim().split("/");
    const author = parts[0] || "unknown";
    const repo = parts[1] || githubRepo.trim();
    const newSkill: CommunitySkill = {
      id: `gh-${Date.now()}`,
      name: repo.replace(/-/g, " ").replace(/_/g, " "),
      description: `Community skill installed from GitHub repository ${author}/${repo}.`,
      category: "Coding",
      steps: [
        { order: 1, action: "clone_repo", description: `Clone ${author}/${repo}`, tool: "shell", parameters: {} },
        { order: 2, action: "parse_skill_md", description: "Parse SKILL.md for skill definition", tool: "document_parser", parameters: {} },
        { order: 3, action: "register_skill", description: "Register skill with the agent", tool: "skill_manager", parameters: {} },
      ],
      tools_needed: ["shell", "document_parser", "skill_manager"],
      examples: [`Use skill from ${author}/${repo}`],
      confidence: 0.75,
      rating: 0,
      installs: 1,
      installed: true,
      repo: `${author}/${repo}`,
      author,
      skillMd: `# ${repo}\n\n> Community skill from **${author}/${repo}**\n\n## Overview\n\nThis skill was installed from a GitHub repository.\n\n## Usage\n\nDescribe your task and the skill will execute the appropriate actions.\n\n## Steps\n\n1. Clone and parse the repository\n2. Load skill definition from SKILL.md\n3. Register with the agent runtime\n\n## Author\n\n@${author}\n`,
    };
    setCommunitySkills((prev) => [...prev, newSkill]);
    setGithubRepo("");
    setIsInstalling(false);
  }, [githubRepo]);

  const removeCommunitySkill = useCallback((id: string) => {
    setCommunitySkills((prev) => prev.filter((s) => s.id !== id));
  }, []);

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-construct-border/50">
        <div className="flex items-center gap-2">
          <Wrench size={16} className="text-construct-accent-primary" />
          <span className="text-sm font-semibold text-construct-text-primary">Skill Marketplace</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Install from GitHub */}
          <div className="flex items-center gap-1.5">
            <div className="relative">
              <Github size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-construct-text-muted" />
              <input
                type="text"
                value={githubRepo}
                onChange={(e) => setGithubRepo(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleGitHubInstall(); }}
                placeholder="owner/repo"
                className="h-7 pl-7 pr-2 bg-[rgba(255,255,255,0.04)] border border-construct-border/50 rounded-lg text-[11px] text-construct-text-primary placeholder-construct-text-muted outline-none focus:border-construct-accent-primary/50 transition-colors w-32"
              />
            </div>
            <GlowButton
              size="sm"
              onClick={handleGitHubInstall}
              disabled={!githubRepo.trim() || isInstalling}
            >
              {isInstalling ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Download size={12} />
              )}
              Install
            </GlowButton>
          </div>
          <GlowButton size="sm" onClick={() => setShowUpload(!showUpload)}>
            <Upload size={12} />
            Upload
          </GlowButton>
        </div>
      </div>

      {/* Upload Zone */}
      <AnimatePresence>
        {showUpload && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`
                mx-4 mt-3 p-6 rounded-xl border-2 border-dashed cursor-pointer text-center transition-all
                ${dragOver
                  ? "border-construct-accent-primary bg-construct-accent-primary/5"
                  : "border-construct-border/50 bg-[rgba(255,255,255,0.02)] hover:border-construct-accent-primary/50"
                }
              `}
            >
              <input ref={fileInputRef} type="file" className="hidden" accept=".md,.txt,.pdf" />
              <FileText size={24} className="mx-auto mb-2 text-construct-text-muted" />
              <p className="text-xs text-construct-text-muted">
                Drag & drop a document, or click to browse
              </p>
              <p className="text-[10px] text-construct-text-muted mt-1">Supports .md, .txt, .pdf</p>
            </div>

            {/* Upload Preview */}
            <AnimatePresence>
              {uploadPreview && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="mx-4 mt-2"
                >
                  <GlassCard className="p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs font-medium text-construct-text-primary">
                          {uploadPreview.name}
                        </div>
                        <div className="text-[10px] text-construct-text-muted">
                          {uploadPreview.steps.length} steps detected
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <GlowButton variant="ghost" size="sm" onClick={() => setUploadPreview(null)}>
                          <X size={12} />
                        </GlowButton>
                        <GlowButton size="sm" onClick={saveUploadedSkill}>
                          <Check size={12} />
                          Save Skill
                        </GlowButton>
                      </div>
                    </div>
                  </GlassCard>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Category Tabs */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-construct-border/50 overflow-x-auto">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`
              px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap transition-all
              ${activeCategory === cat
                ? "bg-construct-accent-primary/15 text-construct-accent-primary border border-construct-accent-primary/25"
                : "text-construct-text-muted hover:text-construct-text-primary hover:bg-[rgba(255,255,255,0.04)]"
              }
            `}
          >
            {cat}
          </button>
        ))}
        <div className="flex-1" />
        <div className="relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-construct-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search skills..."
            className="h-6 pl-7 pr-2 bg-[rgba(255,255,255,0.04)] border border-construct-border/50 rounded-lg text-[11px] text-construct-text-primary placeholder-construct-text-muted outline-none focus:border-construct-accent-primary/50 transition-colors w-36"
          />
        </div>
      </div>

      {/* My Skills Section */}
      {mySkills.length > 0 && (
        <div className="px-4 py-2 border-b border-construct-border/30">
          <div className="text-[11px] font-semibold text-construct-accent-primary mb-2">My Skills</div>
          <div className="flex flex-wrap gap-2">
            {mySkills.map((skill) => (
              <div
                key={skill.id}
                className="flex items-center gap-1.5 px-2 py-1 bg-construct-accent-primary/10 border border-construct-accent-primary/20 rounded-lg"
              >
                <span className="text-[11px] text-construct-text-primary">{skill.name}</span>
                <button
                  onClick={() => removeFromMySkills(skill.id)}
                  className="text-construct-text-muted hover:text-construct-semantic-error transition-colors"
                >
                  <Trash2 size={10} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Bundled Skills (20 Pre-installed) ─── */}
      <div className="flex-1 overflow-auto px-4 py-3">
        <div className="flex items-center gap-2 mb-3">
          <Package size={14} className="text-construct-accent-primary" />
          <h3 className="text-xs font-semibold text-construct-text-primary">
            Bundled Skills
          </h3>
          <span className="px-1.5 py-0.5 bg-construct-accent-primary/10 rounded text-[9px] text-construct-accent-primary">
            {bundledSkills.length} pre-installed
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3 mb-6">
          {bundledSkills
            .filter((skill) => {
              const matchesCategory = activeCategory === "All" || skill.category === activeCategory;
              const matchesSearch =
                skill.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                skill.description.toLowerCase().includes(searchQuery.toLowerCase());
              return matchesCategory && matchesSearch;
            })
            .map((skill) => (
              <GlassCard key={skill.id} className="p-3" glow="accent">
                {/* Skill Header */}
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="text-xs font-semibold text-construct-text-primary">{skill.name}</h3>
                    <p className="text-[10px] text-construct-text-muted mt-0.5 line-clamp-2">
                      {skill.description}
                    </p>
                  </div>
                  <span className="px-1.5 py-0.5 bg-[rgba(255,255,255,0.06)] rounded text-[9px] text-construct-text-muted capitalize shrink-0">
                    {skill.category}
                  </span>
                </div>

                {/* Tools */}
                <div className="flex flex-wrap gap-1 mb-2">
                  {skill.tools_needed.map((tool) => (
                    <span
                      key={tool}
                      className="px-1.5 py-0.5 bg-construct-accent-primary/10 rounded text-[9px] text-construct-accent-primary"
                    >
                      {tool}
                    </span>
                  ))}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 mt-auto pt-2 border-t border-construct-border/30">
                  <GlowButton
                    variant="secondary"
                    size="sm"
                    className="flex-1"
                    onClick={() =>
                      setExpandedSkill(expandedSkill === skill.id ? null : skill.id)
                    }
                  >
                    {expandedSkill === skill.id ? (
                      <>
                        <ChevronUp size={10} />
                        Hide
                      </>
                    ) : (
                      <>
                        <ChevronDown size={10} />
                        Preview
                      </>
                    )}
                  </GlowButton>
                  <GlowButton
                    size="sm"
                    className="flex-1"
                    onClick={() => addToMySkills(skill)}
                    disabled={mySkills.some((s) => s.id === skill.id)}
                  >
                    <Plus size={10} />
                    {mySkills.some((s) => s.id === skill.id) ? "Added" : "Add"}
                  </GlowButton>
                </div>

                {/* Expanded Steps */}
                <AnimatePresence>
                  {expandedSkill === skill.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-2 pt-2 border-t border-construct-border/30 space-y-1">
                        {skill.steps.map((step) => (
                          <div key={step.order} className="flex gap-2 text-[10px]">
                            <span className="shrink-0 w-4 h-4 flex items-center justify-center rounded-full bg-construct-accent-primary/15 text-construct-accent-primary font-medium">
                              {step.order}
                            </span>
                            <div>
                              <span className="text-construct-text-primary font-medium">{step.action}</span>
                              <span className="text-construct-text-muted ml-1">{step.description}</span>
                              {step.tool && (
                                <span className="ml-1 px-1 bg-[rgba(255,255,255,0.06)] rounded text-[9px] text-construct-text-muted">
                                  {step.tool}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                        {/* Confidence */}
                        <div className="flex items-center gap-2 mt-2 pt-1 border-t border-construct-border/30">
                          <span className="text-[10px] text-construct-text-muted">Confidence:</span>
                          <div className="flex-1 h-1.5 bg-[rgba(255,255,255,0.06)] rounded-full overflow-hidden">
                            <motion.div
                              className="h-full rounded-full"
                              style={{
                                background: "linear-gradient(90deg, #6366f1, #10b981)",
                              }}
                              initial={{ width: 0 }}
                              animate={{ width: `${skill.confidence * 100}%` }}
                              transition={{ duration: 0.6, ease: "easeOut" }}
                            />
                          </div>
                          <span className="text-[10px] text-construct-accent-primary">
                            {Math.round(skill.confidence * 100)}%
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </GlassCard>
            ))}
        </div>

        {/* ─── Community Skills (installed from GitHub) ─── */}
        {communitySkills.length > 0 && (
          <>
            <div className="flex items-center gap-2 mb-3">
              <Globe size={14} className="text-construct-semantic-success" />
              <h3 className="text-xs font-semibold text-construct-text-primary">
                Community Skills
              </h3>
              <span className="px-1.5 py-0.5 bg-construct-semantic-success/10 rounded text-[9px] text-construct-semantic-success">
                {communitySkills.length} installed
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3 mb-6">
              {communitySkills.map((skill) => (
                <GlassCard key={skill.id} className="p-3" glow="success">
                  {/* Skill Header */}
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="text-xs font-semibold text-construct-text-primary">{skill.name}</h3>
                      <p className="text-[10px] text-construct-text-muted mt-0.5 line-clamp-2">
                        {skill.description}
                      </p>
                    </div>
                    <span className="px-1.5 py-0.5 bg-construct-semantic-success/10 rounded text-[9px] text-construct-semantic-success capitalize shrink-0">
                      {skill.category}
                    </span>
                  </div>

                  {/* Repo link */}
                  <div className="flex items-center gap-1 text-[10px] text-construct-text-muted mb-2">
                    <Github size={10} />
                    <span>{skill.author}/{skill.repo?.split("/").pop()}</span>
                  </div>

                  {/* Tools */}
                  <div className="flex flex-wrap gap-1 mb-2">
                    {skill.tools_needed.map((tool) => (
                      <span
                        key={tool}
                        className="px-1.5 py-0.5 bg-construct-semantic-success/10 rounded text-[9px] text-construct-semantic-success"
                      >
                        {tool}
                      </span>
                    ))}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 mt-auto pt-2 border-t border-construct-border/30">
                    <GlowButton
                      variant="secondary"
                      size="sm"
                      className="flex-1"
                      onClick={() => setSelectedSkill(skill)}
                    >
                      <BookOpen size={10} />
                      SKILL.md
                    </GlowButton>
                    <GlowButton
                      size="sm"
                      className="flex-1"
                      onClick={() => addToMySkills(skill)}
                      disabled={mySkills.some((s) => s.id === skill.id)}
                    >
                      <Plus size={10} />
                      {mySkills.some((s) => s.id === skill.id) ? "Added" : "Add"}
                    </GlowButton>
                    <GlowButton
                      variant="ghost"
                      size="sm"
                      onClick={() => removeCommunitySkill(skill.id)}
                    >
                      <Trash2 size={10} />
                    </GlowButton>
                  </div>
                </GlassCard>
              ))}
            </div>
          </>
        )}

        {/* ─── Marketplace Skills (discover) ─── */}
        <div className="flex items-center gap-2 mb-3">
          <Star size={14} className="text-[#f59e0b]" />
          <h3 className="text-xs font-semibold text-construct-text-primary">
            Discover
          </h3>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
          {filteredSkills.map((skill) => (
            <GlassCard key={skill.id} className="p-3" glow="accent">
              {/* Skill Header */}
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="text-xs font-semibold text-construct-text-primary">{skill.name}</h3>
                  <p className="text-[10px] text-construct-text-muted mt-0.5 line-clamp-2">
                    {skill.description}
                  </p>
                </div>
                <span className="px-1.5 py-0.5 bg-[rgba(255,255,255,0.06)] rounded text-[9px] text-construct-text-muted capitalize shrink-0">
                  {skill.category}
                </span>
              </div>

              {/* Rating & Installs */}
              <div className="flex items-center gap-2 mb-2">
                <div className="flex items-center gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      size={10}
                      className={i < Math.floor(skill.rating) ? "text-[#f59e0b] fill-[#f59e0b]" : "text-construct-text-muted/30"}
                    />
                  ))}
                  <span className="text-[10px] text-construct-text-muted ml-1">{skill.rating}</span>
                </div>
                <div className="flex items-center gap-1 text-[10px] text-construct-text-muted">
                  <Download size={10} />
                  {skill.installs.toLocaleString()}
                </div>
              </div>

              {/* Tools */}
              <div className="flex flex-wrap gap-1 mb-2">
                {skill.tools_needed.map((tool) => (
                  <span
                    key={tool}
                    className="px-1.5 py-0.5 bg-construct-accent-primary/10 rounded text-[9px] text-construct-accent-primary"
                  >
                    {tool}
                  </span>
                ))}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 mt-auto pt-2 border-t border-construct-border/30">
                <GlowButton
                  variant="secondary"
                  size="sm"
                  className="flex-1"
                  onClick={() =>
                    setExpandedSkill(expandedSkill === skill.id ? null : skill.id)
                  }
                >
                  {expandedSkill === skill.id ? (
                    <>
                      <ChevronUp size={10} />
                      Hide
                    </>
                  ) : (
                    <>
                      <ChevronDown size={10} />
                      Preview
                    </>
                  )}
                </GlowButton>
                <GlowButton
                  size="sm"
                  className="flex-1"
                  onClick={() => addToMySkills(skill)}
                  disabled={mySkills.some((s) => s.id === skill.id)}
                >
                  <Plus size={10} />
                  {mySkills.some((s) => s.id === skill.id) ? "Added" : "Add"}
                </GlowButton>
              </div>

              {/* Expanded Steps */}
              <AnimatePresence>
                {expandedSkill === skill.id && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-2 pt-2 border-t border-construct-border/30 space-y-1">
                      {skill.steps.map((step) => (
                        <div key={step.order} className="flex gap-2 text-[10px]">
                          <span className="shrink-0 w-4 h-4 flex items-center justify-center rounded-full bg-construct-accent-primary/15 text-construct-accent-primary font-medium">
                            {step.order}
                          </span>
                          <div>
                            <span className="text-construct-text-primary font-medium">{step.action}</span>
                            <span className="text-construct-text-muted ml-1">{step.description}</span>
                            {step.tool && (
                              <span className="ml-1 px-1 bg-[rgba(255,255,255,0.06)] rounded text-[9px] text-construct-text-muted">
                                {step.tool}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                      {/* Confidence */}
                      <div className="flex items-center gap-2 mt-2 pt-1 border-t border-construct-border/30">
                        <span className="text-[10px] text-construct-text-muted">Confidence:</span>
                        <div className="flex-1 h-1.5 bg-[rgba(255,255,255,0.06)] rounded-full overflow-hidden">
                          <motion.div
                            className="h-full rounded-full"
                            style={{
                              background: "linear-gradient(90deg, #6366f1, #10b981)",
                            }}
                            initial={{ width: 0 }}
                            animate={{ width: `${skill.confidence * 100}%` }}
                            transition={{ duration: 0.6, ease: "easeOut" }}
                          />
                        </div>
                        <span className="text-[10px] text-construct-accent-primary">
                          {Math.round(skill.confidence * 100)}%
                        </span>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </GlassCard>
          ))}
        </div>

        {filteredSkills.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-construct-text-muted">
            <Search size={24} className="mb-2 opacity-50" />
            <p className="text-xs">No skills found</p>
          </div>
        )}
      </div>

      {/* ─── SKILL.md Detail View ─── */}
      <AnimatePresence>
        {selectedSkill && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-construct-bg-primary/95 backdrop-blur-sm flex items-center justify-center p-6"
            onClick={() => setSelectedSkill(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-2xl max-h-[80vh] bg-construct-bg-secondary border border-construct-border rounded-xl shadow-2xl overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-construct-border/50">
                <div className="flex items-center gap-2">
                  <BookOpen size={16} className="text-construct-accent-primary" />
                  <div>
                    <h3 className="text-sm font-semibold text-construct-text-primary">
                      {selectedSkill.name}
                    </h3>
                    <p className="text-[10px] text-construct-text-muted">
                      {selectedSkill.repo}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedSkill(null)}
                  className="flex items-center justify-center w-7 h-7 rounded hover:bg-construct-bg-elevated text-construct-text-muted transition-colors"
                >
                  <X size={14} />
                </button>
              </div>

              {/* SKILL.md Content */}
              <div className="flex-1 overflow-auto p-4">
                <div className="prose prose-invert prose-sm max-w-none">
                  <pre className="whitespace-pre-wrap text-[11px] text-construct-text-primary font-mono leading-relaxed">
                    {selectedSkill.skillMd || "# No SKILL.md found\n\nThis community skill does not have a SKILL.md file."}
                  </pre>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-4 py-3 border-t border-construct-border/50">
                <div className="flex items-center gap-2 text-[10px] text-construct-text-muted">
                  <Github size={10} />
                  <span>{selectedSkill.author}</span>
                </div>
                <GlowButton
                  size="sm"
                  onClick={() => {
                    addToMySkills(selectedSkill);
                    setSelectedSkill(null);
                  }}
                  disabled={mySkills.some((s) => s.id === selectedSkill.id)}
                >
                  <Plus size={10} />
                  {mySkills.some((s) => s.id === selectedSkill.id) ? "Added" : "Add to My Skills"}
                </GlowButton>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useBrand } from "../context/BrandContext";
import { api } from "../lib/api";

// ─── Types ─────────────────────────────────────────────────

type SkillType = "image" | "captions" | "frames";
type Step = "type-select" | "brand-select" | "form" | "generating" | "preview";

export interface GeneratedSkill {
  name: string;
  description: string;
  content: string;
  actions: string[];
}

interface SkillBuilderModalProps {
  open: boolean;
  onClose: () => void;
  onComplete: (data: GeneratedSkill) => void;
}

interface FormData {
  brand_name: string;
  brand_description: string;
  product_details: string;
  target_platforms: string[];

  // Image
  product_visual_rules: string;
  visual_style: string;
  visual_style_details: string;
  composition_preferences: string;
  lighting_preferences: string;
  content_types_visual_direction: string;
  dos_and_donts: string;

  // Frames
  video_sequence_types: string;
  frame_progression_style: string;
  motion_action_types: string;
  video_content_types: string;
  video_dos_and_donts: string;

  // Captions
  brand_voice_tone: string;
  languages: string[];
  language_guidelines: string;
  caption_length_preference: string;
  hashtag_strategy: string;
  emoji_usage: string;
  cta_style: string;
  content_rotation_strategy: string;
  example_caption: string;
}

const EMPTY_FORM: FormData = {
  brand_name: "",
  brand_description: "",
  product_details: "",
  target_platforms: [],
  product_visual_rules: "",
  visual_style: "",
  visual_style_details: "",
  composition_preferences: "",
  lighting_preferences: "",
  content_types_visual_direction: "",
  dos_and_donts: "",
  video_sequence_types: "",
  frame_progression_style: "",
  motion_action_types: "",
  video_content_types: "",
  video_dos_and_donts: "",
  brand_voice_tone: "",
  languages: [],
  language_guidelines: "",
  caption_length_preference: "",
  hashtag_strategy: "",
  emoji_usage: "",
  cta_style: "",
  content_rotation_strategy: "",
  example_caption: "",
};

const PLATFORMS = [
  "Instagram",
  "TikTok",
  "Facebook",
  "LinkedIn",
  "YouTube",
  "X",
];

const VISUAL_STYLES = [
  "Photorealistic Lifestyle",
  "Studio Product Photography",
  "Editorial / Magazine",
  "Cinematic / Dramatic",
  "Flat Lay / Overhead",
  "Graphic / Poster Design",
  "3D Render",
];

const LANGUAGES = [
  "English",
  "Albanian",
  "Spanish",
  "French",
  "German",
  "Italian",
  "Portuguese",
  "Arabic",
  "Turkish",
];

const SKILL_TYPE_INFO: Record<
  SkillType,
  { label: string; description: string }
> = {
  image: {
    label: "Image Generation",
    description:
      "Product photography, lifestyle shots, posters, social media visuals",
  },
  captions: {
    label: "Text / Captions",
    description:
      "Instagram captions, social media copy, hashtags, multilingual posts",
  },
  frames: {
    label: "Video Frames",
    description:
      "Sequential keyframes for short videos, product reveals, pour shots",
  },
};

// ─── Component ─────────────────────────────────────────────

export function SkillBuilderModal({
  open,
  onClose,
  onComplete,
}: SkillBuilderModalProps) {
  const { session } = useAuth();
  const token = session?.access_token;
  const { brands, selectedBrand } = useBrand();

  const [step, setStep] = useState<Step>("type-select");
  const [skillType, setSkillType] = useState<SkillType | null>(null);
  const [brandId, setBrandId] = useState<string>("");
  const [formData, setFormData] = useState<FormData>({ ...EMPTY_FORM });
  const [generatedSkill, setGeneratedSkill] = useState<GeneratedSkill | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setStep("type-select");
      setSkillType(null);
      setBrandId(selectedBrand?.id || "");
      setFormData({ ...EMPTY_FORM });
      setGeneratedSkill(null);
      setError(null);
    }
  }, [open, selectedBrand?.id]);

  // Pre-fill brand name when brand selection changes
  useEffect(() => {
    const brand = brands.find((b) => b.id === brandId);
    if (brand) {
      setFormData((prev) => ({
        ...prev,
        brand_name: brand.name,
        brand_description: brand.description || "",
      }));
    }
  }, [brandId, brands]);

  if (!open) return null;

  const updateField = (field: keyof FormData, value: string | string[]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const toggleArrayField = (field: "target_platforms" | "languages", value: string) => {
    setFormData((prev) => {
      const arr = prev[field];
      return {
        ...prev,
        [field]: arr.includes(value)
          ? arr.filter((v) => v !== value)
          : [...arr, value],
      };
    });
  };

  const handleGenerate = async () => {
    if (!token || !skillType) return;
    setStep("generating");
    setError(null);

    try {
      const result = await api<GeneratedSkill>("/skill-builder/generate", {
        method: "POST",
        body: {
          skill_type: skillType,
          form_data: formData,
        },
        token,
      });
      setGeneratedSkill(result);
      setStep("preview");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Generation failed. Try again."
      );
      setStep("form");
    }
  };

  const handleEditAndSave = () => {
    if (generatedSkill) {
      onComplete(generatedSkill);
    }
  };

  // ─── Render helpers ────────────────────────────────────────

  const inputClass =
    "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent";
  const textareaClass = `${inputClass} min-h-[80px] resize-y`;
  const labelClass = "block text-sm font-medium text-gray-700 mb-1";
  const hintClass = "text-xs text-gray-400 mt-1";

  const renderCommonFields = () => (
    <>
      <div>
        <label className={labelClass}>Brand Name *</label>
        <input
          type="text"
          value={formData.brand_name}
          onChange={(e) => updateField("brand_name", e.target.value)}
          className={inputClass}
          placeholder="e.g. Aranxhata"
        />
      </div>
      <div>
        <label className={labelClass}>Brand Description</label>
        <textarea
          value={formData.brand_description}
          onChange={(e) => updateField("brand_description", e.target.value)}
          className={textareaClass}
          placeholder="What is the brand? Target audience, positioning, values..."
        />
      </div>
      <div>
        <label className={labelClass}>Product Details *</label>
        <textarea
          value={formData.product_details}
          onChange={(e) => updateField("product_details", e.target.value)}
          className={`${textareaClass} min-h-[120px]`}
          placeholder={
            "Describe each product/variant in detail:\n- Name, colors, shapes, packaging\n- Label text, typography, distinguishing features\n- What makes each variant visually unique"
          }
        />
        <p className={hintClass}>
          The more visual detail you provide, the better the AI can enforce
          product accuracy.
        </p>
      </div>
      <div>
        <label className={labelClass}>Target Platforms</label>
        <div className="flex flex-wrap gap-2">
          {PLATFORMS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => toggleArrayField("target_platforms", p)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                formData.target_platforms.includes(p)
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white text-gray-600 border-gray-300 hover:border-indigo-400"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
    </>
  );

  const renderImageFields = () => (
    <>
      <div className="pt-2 border-t border-gray-200">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">
          Image-Specific Details
        </h3>
      </div>
      <div>
        <label className={labelClass}>Product Visual Accuracy Rules</label>
        <textarea
          value={formData.product_visual_rules}
          onChange={(e) => updateField("product_visual_rules", e.target.value)}
          className={`${textareaClass} min-h-[100px]`}
          placeholder={
            "What must NEVER change about your product's appearance?\ne.g. 'Rose variant must always be hot pink/magenta, never pastel pink'\ne.g. 'Label must always show cursive brand name with bold variant name below'"
          }
        />
      </div>
      <div>
        <label className={labelClass}>Visual Style</label>
        <select
          value={formData.visual_style}
          onChange={(e) => updateField("visual_style", e.target.value)}
          className={inputClass}
        >
          <option value="">Select primary style...</option>
          {VISUAL_STYLES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <textarea
          value={formData.visual_style_details}
          onChange={(e) =>
            updateField("visual_style_details", e.target.value)
          }
          className={`${textareaClass} mt-2`}
          placeholder="Additional style details: color palette, mood, aesthetic references..."
        />
      </div>
      <div>
        <label className={labelClass}>Composition Preferences</label>
        <textarea
          value={formData.composition_preferences}
          onChange={(e) =>
            updateField("composition_preferences", e.target.value)
          }
          className={textareaClass}
          placeholder="Product placement rules, angles, max product count in frame, hero product positioning..."
        />
      </div>
      <div>
        <label className={labelClass}>Lighting Preferences</label>
        <textarea
          value={formData.lighting_preferences}
          onChange={(e) => updateField("lighting_preferences", e.target.value)}
          className={textareaClass}
          placeholder="Preferred lighting: warm golden hour, moody bar lighting, bright studio, natural daylight..."
        />
      </div>
      <div>
        <label className={labelClass}>
          Content Types & Visual Direction
        </label>
        <textarea
          value={formData.content_types_visual_direction}
          onChange={(e) =>
            updateField("content_types_visual_direction", e.target.value)
          }
          className={`${textareaClass} min-h-[120px]`}
          placeholder={
            "List your main content types and describe the look for each:\n- Lifestyle/Couple: romantic, sun-drenched, Mediterranean cafe\n- Product Showcase: clean, minimal, bold colored background\n- Bartender/Cocktail: moody bar, close-up pour shots"
          }
        />
        <p className={hintClass}>
          This is one of the most valuable sections. The more content types you
          describe, the better the skill.
        </p>
      </div>
      <div>
        <label className={labelClass}>Do's and Don'ts</label>
        <textarea
          value={formData.dos_and_donts}
          onChange={(e) => updateField("dos_and_donts", e.target.value)}
          className={textareaClass}
          placeholder="Do: always show label facing camera. Don't: never cluster more than 3 products..."
        />
      </div>
    </>
  );

  const renderCaptionsFields = () => (
    <>
      <div className="pt-2 border-t border-gray-200">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">
          Captions-Specific Details
        </h3>
      </div>
      <div>
        <label className={labelClass}>Brand Voice & Tone</label>
        <textarea
          value={formData.brand_voice_tone}
          onChange={(e) => updateField("brand_voice_tone", e.target.value)}
          className={textareaClass}
          placeholder="Warm and youthful? Professional and authoritative? Playful and irreverent? Describe the personality..."
        />
      </div>
      <div>
        <label className={labelClass}>Languages</label>
        <div className="flex flex-wrap gap-2">
          {LANGUAGES.map((lang) => (
            <button
              key={lang}
              type="button"
              onClick={() => toggleArrayField("languages", lang)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                formData.languages.includes(lang)
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white text-gray-600 border-gray-300 hover:border-indigo-400"
              }`}
            >
              {lang}
            </button>
          ))}
        </div>
        <textarea
          value={formData.language_guidelines}
          onChange={(e) => updateField("language_guidelines", e.target.value)}
          className={`${textareaClass} mt-2`}
          placeholder="Language-specific notes: 'Albanian should sound natural and conversational, not formal. English version should adapt, not directly translate.'"
        />
      </div>
      <div>
        <label className={labelClass}>Caption Length Preference</label>
        <select
          value={formData.caption_length_preference}
          onChange={(e) =>
            updateField("caption_length_preference", e.target.value)
          }
          className={inputClass}
        >
          <option value="">Select...</option>
          <option value="short">Short (80-150 chars)</option>
          <option value="medium">Medium (150-300 chars)</option>
          <option value="long">Long (300-500 chars)</option>
        </select>
      </div>
      <div>
        <label className={labelClass}>Hashtag Strategy</label>
        <textarea
          value={formData.hashtag_strategy}
          onChange={(e) => updateField("hashtag_strategy", e.target.value)}
          className={textareaClass}
          placeholder="How many hashtags? Always-include branded tags? Mix of general and niche? Platform-specific?"
        />
      </div>
      <div>
        <label className={labelClass}>Emoji Usage</label>
        <select
          value={formData.emoji_usage}
          onChange={(e) => updateField("emoji_usage", e.target.value)}
          className={inputClass}
        >
          <option value="">Select...</option>
          <option value="none">None</option>
          <option value="minimal">Minimal (1-2 per post)</option>
          <option value="moderate">Moderate (2-4 per post)</option>
          <option value="heavy">Heavy (5+ per post)</option>
        </select>
      </div>
      <div>
        <label className={labelClass}>CTA Style</label>
        <textarea
          value={formData.cta_style}
          onChange={(e) => updateField("cta_style", e.target.value)}
          className={textareaClass}
          placeholder="What CTAs work for your brand? 'Tag a friend', 'Save for later', 'Link in bio', 'Comment your favorite'..."
        />
      </div>
      <div>
        <label className={labelClass}>Content Rotation Strategy</label>
        <textarea
          value={formData.content_rotation_strategy}
          onChange={(e) =>
            updateField("content_rotation_strategy", e.target.value)
          }
          className={textareaClass}
          placeholder="How do you rotate content types? Weekday vs weekend posting? Seasonal adjustments?"
        />
      </div>
      <div>
        <label className={labelClass}>Example Caption (optional)</label>
        <textarea
          value={formData.example_caption}
          onChange={(e) => updateField("example_caption", e.target.value)}
          className={`${textareaClass} min-h-[100px]`}
          placeholder="Paste an example of a caption that represents your brand well..."
        />
      </div>
    </>
  );

  const renderFramesFields = () => (
    <>
      <div className="pt-2 border-t border-gray-200">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">
          Video Frames-Specific Details
        </h3>
      </div>
      <div>
        <label className={labelClass}>Product Visual Accuracy Rules</label>
        <textarea
          value={formData.product_visual_rules}
          onChange={(e) => updateField("product_visual_rules", e.target.value)}
          className={`${textareaClass} min-h-[100px]`}
          placeholder={
            "What must NEVER change about your product's appearance across frames?\nVariant colors, label details, design elements that must be locked..."
          }
        />
      </div>
      <div>
        <label className={labelClass}>Video Sequence Types</label>
        <textarea
          value={formData.video_sequence_types}
          onChange={(e) =>
            updateField("video_sequence_types", e.target.value)
          }
          className={textareaClass}
          placeholder="What kinds of video sequences do you want? Pour shots, product reveals, lifestyle moments, recipe preparation..."
        />
      </div>
      <div>
        <label className={labelClass}>Frame Progression Style</label>
        <textarea
          value={formData.frame_progression_style}
          onChange={(e) =>
            updateField("frame_progression_style", e.target.value)
          }
          className={textareaClass}
          placeholder="How should frames progress? Slow and cinematic? Quick cuts? Continuous smooth action?"
        />
      </div>
      <div>
        <label className={labelClass}>Motion & Action Types</label>
        <textarea
          value={formData.motion_action_types}
          onChange={(e) =>
            updateField("motion_action_types", e.target.value)
          }
          className={textareaClass}
          placeholder="What motions/actions should feature in videos? Pouring, splashing, rotating, revealing, assembling..."
        />
      </div>
      <div>
        <label className={labelClass}>Content Types Suited for Video</label>
        <textarea
          value={formData.video_content_types}
          onChange={(e) => updateField("video_content_types", e.target.value)}
          className={textareaClass}
          placeholder="Which of your content types work well as video? Bartender pour, product showcase, recipe mix..."
        />
      </div>
      <div>
        <label className={labelClass}>Video Do's and Don'ts</label>
        <textarea
          value={formData.video_dos_and_donts}
          onChange={(e) =>
            updateField("video_dos_and_donts", e.target.value)
          }
          className={textareaClass}
          placeholder="Do: keep camera angle consistent. Don't: jump between locations between frames..."
        />
      </div>
    </>
  );

  // ─── Step renders ──────────────────────────────────────────

  const renderTypeSelect = () => (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        What type of skill do you want to generate?
      </p>
      <div className="grid grid-cols-1 gap-3">
        {(Object.entries(SKILL_TYPE_INFO) as [SkillType, typeof SKILL_TYPE_INFO.image][]).map(
          ([type, info]) => (
            <button
              key={type}
              onClick={() => {
                setSkillType(type);
                setStep("brand-select");
              }}
              className="text-left p-4 rounded-xl border border-gray-200 hover:border-indigo-400 hover:bg-indigo-50/50 transition-all group"
            >
              <h3 className="font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors">
                {info.label}
              </h3>
              <p className="mt-0.5 text-sm text-gray-500">
                {info.description}
              </p>
            </button>
          )
        )}
      </div>
    </div>
  );

  const renderBrandSelect = () => (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Select the brand this skill is for.
      </p>
      {brands.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">
          No brands found. Create a brand on the Brand Identity page first.
        </div>
      ) : (
        <>
          <select
            value={brandId}
            onChange={(e) => setBrandId(e.target.value)}
            className={inputClass}
          >
            <option value="">Select a brand...</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <div className="flex justify-end">
            <button
              onClick={() => setStep("form")}
              disabled={!brandId}
              className="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );

  const renderForm = () => (
    <div className="space-y-4">
      {error && (
        <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}
      {renderCommonFields()}
      {skillType === "image" && renderImageFields()}
      {skillType === "captions" && renderCaptionsFields()}
      {skillType === "frames" && renderFramesFields()}
      <div className="flex justify-end pt-2">
        <button
          onClick={handleGenerate}
          disabled={!formData.brand_name.trim() || !formData.product_details.trim()}
          className="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Generate Skill
        </button>
      </div>
    </div>
  );

  const renderGenerating = () => (
    <div className="flex flex-col items-center justify-center py-16 space-y-4">
      <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      <p className="text-sm text-gray-500">
        Generating your {skillType} skill...
      </p>
      <p className="text-xs text-gray-400">This may take 15-30 seconds.</p>
    </div>
  );

  const renderPreview = () => (
    <div className="space-y-4">
      {generatedSkill && (
        <>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-900">
              {generatedSkill.name}
            </h3>
            {generatedSkill.actions.map((a) => (
              <span
                key={a}
                className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-indigo-50 text-indigo-600"
              >
                {a}
              </span>
            ))}
          </div>
          <p className="text-sm text-gray-500">{generatedSkill.description}</p>
          <div className="max-h-[400px] overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-4">
            <pre className="text-xs font-mono text-gray-700 whitespace-pre-wrap">
              {generatedSkill.content}
            </pre>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleEditAndSave}
              className="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Edit & Save
            </button>
            <button
              onClick={() => {
                setStep("generating");
                handleGenerate();
              }}
              className="px-4 py-2 text-gray-600 text-sm font-medium rounded-lg border border-gray-300 hover:bg-gray-100 transition-colors"
            >
              Regenerate
            </button>
          </div>
        </>
      )}
    </div>
  );

  // ─── Step titles ───────────────────────────────────────────

  const stepTitles: Record<Step, string> = {
    "type-select": "Generate Skill with AI",
    "brand-select": `${skillType ? SKILL_TYPE_INFO[skillType].label : ""} — Select Brand`,
    form: `${skillType ? SKILL_TYPE_INFO[skillType].label : ""} — Details`,
    generating: "Generating...",
    preview: "Review Generated Skill",
  };

  const canGoBack =
    step === "brand-select" || step === "form" || step === "preview";
  const handleBack = () => {
    if (step === "brand-select") setStep("type-select");
    else if (step === "form") setStep("brand-select");
    else if (step === "preview") setStep("form");
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <div className="flex items-center gap-3">
              {canGoBack && (
                <button
                  onClick={handleBack}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15 19l-7-7 7-7"
                    />
                  </svg>
                </button>
              )}
              <h2 className="text-lg font-semibold text-gray-900">
                {stepTitles[step]}
              </h2>
            </div>
            {step !== "generating" && (
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 transition-colors text-2xl leading-none"
              >
                &times;
              </button>
            )}
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5 min-h-0">
            {step === "type-select" && renderTypeSelect()}
            {step === "brand-select" && renderBrandSelect()}
            {step === "form" && renderForm()}
            {step === "generating" && renderGenerating()}
            {step === "preview" && renderPreview()}
          </div>
        </div>
      </div>
    </>
  );
}

import { useState, useEffect } from "react";
import { api } from "../lib/api";

interface Skill {
  id: string;
  name: string;
  description: string | null;
}

interface SkillPickerProps {
  action: "image" | "text" | "video" | "frames";
  token: string;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export function SkillPicker({ action, token, selectedIds, onChange }: SkillPickerProps) {
  const [skills, setSkills] = useState<Skill[]>([]);

  useEffect(() => {
    if (!token) return;
    api<{ skills: Skill[] }>(`/skills/by-action/${action}`, { token })
      .then((data) => setSkills(data.skills))
      .catch(console.error);
  }, [action, token]);

  if (skills.length === 0) return null;

  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((s) => s !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">
        Skills (optional)
      </label>
      <div className="flex flex-wrap gap-2">
        {skills.map((skill) => {
          const selected = selectedIds.includes(skill.id);
          const className = selected
            ? "bg-indigo-600 text-white border-indigo-600"
            : "bg-white text-gray-600 border-gray-300 hover:border-indigo-400 hover:text-indigo-600";

          return (
            <button
              key={skill.id}
              type="button"
              onClick={() => toggle(skill.id)}
              title={skill.description || undefined}
              className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${className}`}
            >
              {skill.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

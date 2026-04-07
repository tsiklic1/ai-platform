import { useState, useEffect, useRef } from "react";
import { api } from "../lib/api";

interface Skill {
  id: string;
  name: string;
  description: string | null;
  is_default?: boolean;
}

interface SkillPickerProps {
  action: "image" | "text" | "video" | "frames";
  token: string;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export function SkillPicker({ action, token, selectedIds, onChange }: SkillPickerProps) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const defaultsAppliedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api<{ skills: Skill[] }>(`/skills/by-action/${action}`, { token })
      .then((data) => {
        setSkills(data.skills);
        // Pre-select default skills once per action load
        const key = `${action}`;
        if (defaultsAppliedRef.current !== key) {
          const defaultIds = data.skills
            .filter((s) => s.is_default)
            .map((s) => s.id);
          if (defaultIds.length > 0) {
            onChange(Array.from(new Set([...selectedIds, ...defaultIds])));
          }
          defaultsAppliedRef.current = key;
        }
      })
      .catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          const isDefault = !!skill.is_default;

          let className: string;
          if (isDefault) {
            className = selected
              ? "bg-amber-500 text-white border-amber-500"
              : "bg-amber-50 text-amber-700 border-amber-300 hover:border-amber-500";
          } else {
            className = selected
              ? "bg-indigo-600 text-white border-indigo-600"
              : "bg-white text-gray-600 border-gray-300 hover:border-indigo-400 hover:text-indigo-600";
          }

          return (
            <button
              key={skill.id}
              type="button"
              onClick={() => toggle(skill.id)}
              title={skill.description || undefined}
              className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${className}`}
            >
              {isDefault && <span className="mr-1">★</span>}
              {skill.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

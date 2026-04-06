import { useNavigate } from "react-router-dom";

export function NoBrandPrompt() {
  const navigate = useNavigate();

  return (
    <div className="flex items-center justify-center py-16">
      <div className="text-center max-w-sm">
        <div className="text-4xl mb-3">🏢</div>
        <h3 className="text-lg font-medium text-gray-900 mb-1">
          No brand selected
        </h3>
        <p className="text-gray-500 text-sm mb-5">
          Create a brand to get started with content generation.
        </p>
        <button
          onClick={() => navigate("/brands/new")}
          className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Create your first brand →
        </button>
      </div>
    </div>
  );
}

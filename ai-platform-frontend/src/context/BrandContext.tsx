import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { api } from "../lib/api";
import { useAuth } from "./AuthContext";

export interface Brand {
  id: string;
  name: string;
  description: string | null;
  updated_at: string;
}

interface BrandContextType {
  brands: Brand[];
  selectedBrand: Brand | null;
  loading: boolean;
  setSelectedBrand: (brand: Brand) => void;
  refreshBrands: () => Promise<void>;
}

const BrandContext = createContext<BrandContextType | null>(null);

const STORAGE_KEY = "ai_platform_selected_brand";

export function BrandProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrand, setSelectedBrandState] = useState<Brand | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchBrands = useCallback(async () => {
    if (!session?.access_token) {
      setBrands([]);
      setSelectedBrandState(null);
      setLoading(false);
      return;
    }

    try {
      const data = await api<{ brands: Brand[] }>("/brands", {
        token: session.access_token,
      });
      const fetched = data.brands;
      setBrands(fetched);

      // Restore selection from localStorage
      const storedId = localStorage.getItem(STORAGE_KEY);
      const match = fetched.find((b) => b.id === storedId);

      if (match) {
        setSelectedBrandState(match);
      } else if (fetched.length > 0) {
        setSelectedBrandState(fetched[0]);
        localStorage.setItem(STORAGE_KEY, fetched[0].id);
      } else {
        setSelectedBrandState(null);
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (err) {
      console.error("[BrandContext] Failed to fetch brands:", err);
      setBrands([]);
      setSelectedBrandState(null);
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    fetchBrands();
  }, [fetchBrands]);

  const setSelectedBrand = (brand: Brand) => {
    setSelectedBrandState(brand);
    localStorage.setItem(STORAGE_KEY, brand.id);
  };

  const refreshBrands = async () => {
    await fetchBrands();
  };

  return (
    <BrandContext.Provider
      value={{ brands, selectedBrand, loading, setSelectedBrand, refreshBrands }}
    >
      {children}
    </BrandContext.Provider>
  );
}

export function useBrand() {
  const ctx = useContext(BrandContext);
  if (!ctx) throw new Error("useBrand must be used within BrandProvider");
  return ctx;
}

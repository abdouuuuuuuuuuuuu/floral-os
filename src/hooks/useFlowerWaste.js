// src/hooks/useFlowerWaste.js
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

function localDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function firstDayOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function monthStartForRange(months) {
  const date = firstDayOfMonth(new Date());
  date.setMonth(date.getMonth() - Math.max(1, Number(months) || 12) + 1);
  return localDateString(date);
}

function friendlyError(error) {
  const message = error?.message || "";
  if (message.includes("Not authenticated"))
    return "Your session expired. Please sign in again.";
  if (message.includes("Insufficient stock")) return message;
  if (message.includes("Only products in the Flowers category")) return message;
  if (message.includes("Product not found"))
    return "This product no longer exists. Refresh the product list.";
  return message || "Could not record flower waste.";
}

export function useFlowerWaste() {
  const [saving, setSaving] = useState(false);

  const recordFlowerWaste = useCallback(
    async (productId, quantity, reason = "Other") => {
      const parsedProductId = Number(productId);
      const parsedQuantity = Math.floor(Number(quantity));

      if (!Number.isInteger(parsedProductId) || parsedProductId <= 0) {
        return { success: false, error: "Invalid product." };
      }
      if (!Number.isInteger(parsedQuantity) || parsedQuantity <= 0) {
        return { success: false, error: "Quantity must be greater than zero." };
      }

      setSaving(true);
      try {
        const { data, error } = await supabase.rpc("record_flower_waste", {
          p_product_id: parsedProductId,
          p_quantity: parsedQuantity,
          p_reason:
            String(reason || "Other")
              .trim()
              .slice(0, 100) || "Other",
        });

        if (error) throw error;
        return { success: true, ...data };
      } catch (error) {
        console.error("[useFlowerWaste] Failed to record waste:", error);
        return { success: false, error: friendlyError(error) };
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  return { recordFlowerWaste, saving };
}

export function useFlowerWasteReport({ months = 12 } = {}) {
  const [monthlyWaste, setMonthlyWaste] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const startDate = useMemo(() => monthStartForRange(months), [months]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: queryError } = await supabase
      .from("monthly_flower_waste")
      .select("month, total_quantity, total_cost, entry_count, product_count")
      .gte("month", startDate)
      .order("month", { ascending: true });

    if (queryError) {
      console.error(
        "[useFlowerWasteReport] Failed to load report:",
        queryError,
      );
      setError(queryError.message || "Could not load flower waste report.");
      setMonthlyWaste([]);
    } else {
      setMonthlyWaste(
        (data || []).map((row) => ({
          month: row.month,
          totalQuantity: Number(row.total_quantity) || 0,
          totalCost: Number(row.total_cost) || 0,
          entryCount: Number(row.entry_count) || 0,
          productCount: Number(row.product_count) || 0,
        })),
      );
    }

    setLoading(false);
  }, [startDate]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const totals = useMemo(
    () =>
      monthlyWaste.reduce(
        (result, row) => ({
          quantity: result.quantity + row.totalQuantity,
          cost: result.cost + row.totalCost,
          entries: result.entries + row.entryCount,
        }),
        { quantity: 0, cost: 0, entries: 0 },
      ),
    [monthlyWaste],
  );

  return { monthlyWaste, totals, loading, error, refresh };
}

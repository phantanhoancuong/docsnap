import { useContext } from "react";

import { LoadingContext } from "@/app/contexts/LoadingContext";

/**
 * Consume the `LoadingContext` to access loading state and setters.
 *
 * @throws If used outside of `LoadingContextProvider`.
 */
export const useLoading = () => {
  const context = useContext(LoadingContext);
  if (!context)
    throw new Error("useLoading must be used within LoadingContextProvider");
  return context;
};

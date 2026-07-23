import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase, supabaseEnabled } from "../lib/supabaseClient.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [orgMemberships, setOrgMemberships] = useState([]);
  const [loading, setLoading] = useState(supabaseEnabled);

  useEffect(() => {
    if (!supabaseEnabled) {
      setLoading(false);
      return;
    }

    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      active = false;
      subscription?.subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!supabaseEnabled || !session?.user) {
      setOrgMemberships([]);
      return;
    }
    let active = true;
    supabase
      .from("organization_members")
      .select("organization_id, role, organization:organizations(id, name, kind)")
      .eq("user_id", session.user.id)
      .then(({ data, error }) => {
        if (!active || error) return;
        setOrgMemberships(data || []);
      });
    return () => {
      active = false;
    };
  }, [session?.user?.id]);

  const value = useMemo(
    () => ({
      user: session?.user || null,
      session,
      orgMemberships,
      orgIds: orgMemberships.map((m) => m.organization_id),
      loading,
      signOut: () => supabase?.auth.signOut(),
    }),
    [session, orgMemberships, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

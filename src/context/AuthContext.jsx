import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase, supabaseEnabled } from "../lib/supabaseClient.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [orgMemberships, setOrgMemberships] = useState([]);
  const [orgsLoaded, setOrgsLoaded] = useState(false);
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

  const refetchMemberships = useCallback(async () => {
    if (!supabaseEnabled || !session?.user) {
      setOrgMemberships([]);
      setOrgsLoaded(true);
      return;
    }
    const { data, error } = await supabase
      .from("organization_members")
      .select("organization_id, role, organization:organizations(id, name, kind)")
      .eq("user_id", session.user.id);
    if (error) throw error;
    setOrgMemberships(data || []);
    setOrgsLoaded(true);
  }, [session?.user?.id]);

  useEffect(() => {
    if (!supabaseEnabled || !session?.user) {
      setOrgMemberships([]);
      setOrgsLoaded(false);
      return;
    }
    let active = true;
    setOrgsLoaded(false);
    supabase
      .from("organization_members")
      .select("organization_id, role, organization:organizations(id, name, kind)")
      .eq("user_id", session.user.id)
      .then(({ data, error }) => {
        if (!active || error) return;
        setOrgMemberships(data || []);
        setOrgsLoaded(true);
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
      orgsLoaded,
      loading,
      refetchMemberships,
      signOut: () => supabase?.auth.signOut(),
    }),
    [session, orgMemberships, orgsLoaded, loading, refetchMemberships]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

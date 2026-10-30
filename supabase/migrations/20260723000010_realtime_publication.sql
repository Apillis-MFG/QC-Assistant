-- Only the tables collaborators need live updates for. projects/organizations/
-- project_shares change rarely -- refetch-on-navigation is enough for those,
-- so they're deliberately excluded to keep the realtime channel lighter.
alter publication supabase_realtime add table drawings;
alter publication supabase_realtime add table characteristics;
alter publication supabase_realtime add table measurements;

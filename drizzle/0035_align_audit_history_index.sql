DROP INDEX IF EXISTS public.audit_events_organization_created_idx;
CREATE INDEX audit_events_organization_created_idx ON public.audit_events (organization_id, created_at DESC, id DESC);

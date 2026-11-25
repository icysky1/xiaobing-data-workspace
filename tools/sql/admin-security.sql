-- 小兵数据站 · 管理后台权限（服务端）
-- 2026-11-18 已应用到 wbapp_1VPgE5qQVfK73Al8nZsWHD
--
-- 设计：
--   1) admin_secret 存放主人码/管理口令，开启 RLS 且不给 anon/authenticated 任何权限，
--      只能由 SECURITY DEFINER 函数读取；客户端因此拿不到明文。
--   2) admin_login(p_code) 统一处理「首次绑定主人」与「日常登录」：
--        - 未绑定：p_code = owner_code → 写入 settings.admin_owner = auth.uid()
--        - 已绑定：auth.uid() = admin_owner 且 p_code = admin_pass → 通过
--   3) set_admin_pass(p_new) 仅管理员可改口令（至少 6 位）。
--   4) notices / guides / settings 的写策略统一改为 is_admin()，
--      普通登录用户即使调用 SDK 也无法新增或修改内容。
--
-- 回滚（按需）：
--   DROP POLICY settings_admin_insert/update/delete ON settings; 恢复 settings_owner_*；
--   DROP POLICY notices_admin_* / guides_admin_*; 恢复 *_own 策略；
--   DROP FUNCTION admin_login(text), set_admin_pass(text), is_admin();
--   DROP TABLE admin_secret;

CREATE TABLE IF NOT EXISTS public.admin_secret (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  owner_code text NOT NULL,
  admin_pass text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_secret ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_secret FROM PUBLIC, anon, authenticated;

INSERT INTO public.admin_secret (id, owner_code, admin_pass)
VALUES (true, 'xb-owner-2026', 'xb2026')
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.settings
    WHERE key = 'admin_owner' AND value = auth.uid()::text
  )
$$;

CREATE OR REPLACE FUNCTION public.admin_login(p_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid text := auth.uid()::text;
  v_owner text;
  v_pass text;
  v_ocode text;
BEGIN
  IF v_uid IS NULL OR v_uid = '' THEN
    RETURN false;
  END IF;
  SELECT value INTO v_owner FROM public.settings WHERE key = 'admin_owner' LIMIT 1;
  SELECT owner_code, admin_pass INTO v_ocode, v_pass FROM public.admin_secret WHERE id LIMIT 1;
  IF v_owner IS NULL THEN
    IF p_code IS NOT NULL AND p_code = v_ocode THEN
      BEGIN
        INSERT INTO public.settings (key, value, owner_id) VALUES ('admin_owner', v_uid, v_uid);
      EXCEPTION WHEN unique_violation THEN
        RETURN false;
      END;
      RETURN true;
    END IF;
    PERFORM pg_sleep(0.3);
    RETURN false;
  END IF;
  IF v_owner <> v_uid THEN
    PERFORM pg_sleep(0.3);
    RETURN false;
  END IF;
  IF p_code IS NOT NULL AND p_code = v_pass THEN
    RETURN true;
  END IF;
  PERFORM pg_sleep(0.3);
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_admin_pass(p_new text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RETURN false;
  END IF;
  IF p_new IS NULL OR length(btrim(p_new)) < 6 THEN
    RETURN false;
  END IF;
  UPDATE public.admin_secret SET admin_pass = btrim(p_new), updated_at = now() WHERE id;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
REVOKE ALL ON FUNCTION public.admin_login(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_login(text) TO authenticated;
REVOKE ALL ON FUNCTION public.set_admin_pass(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_admin_pass(text) TO authenticated;

DROP POLICY IF EXISTS settings_owner_write ON public.settings;
DROP POLICY IF EXISTS settings_owner_update ON public.settings;
DROP POLICY IF EXISTS settings_owner_delete ON public.settings;
DROP POLICY IF EXISTS notices_insert_own ON public.notices;
DROP POLICY IF EXISTS notices_update_own ON public.notices;
DROP POLICY IF EXISTS notices_delete_own ON public.notices;
DROP POLICY IF EXISTS guides_insert_own ON public.guides;
DROP POLICY IF EXISTS guides_update_own ON public.guides;
DROP POLICY IF EXISTS guides_delete_own ON public.guides;

CREATE POLICY settings_admin_insert ON public.settings
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY settings_admin_update ON public.settings
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY settings_admin_delete ON public.settings
  FOR DELETE TO authenticated USING (public.is_admin());

CREATE POLICY notices_admin_insert ON public.notices
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY notices_admin_update ON public.notices
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY notices_admin_delete ON public.notices
  FOR DELETE TO authenticated USING (public.is_admin());

CREATE POLICY guides_admin_insert ON public.guides
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY guides_admin_update ON public.guides
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY guides_admin_delete ON public.guides
  FOR DELETE TO authenticated USING (public.is_admin());

NOTIFY pgrst, 'reload schema';

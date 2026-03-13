-- Add invite token to groups
ALTER TABLE groups
  ADD COLUMN invite_token uuid DEFAULT gen_random_uuid() NOT NULL;

-- SECURITY DEFINER function so a non-member can join using the token
CREATE OR REPLACE FUNCTION join_group_with_invite(p_group_id uuid, p_token uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM groups WHERE id = p_group_id AND invite_token = p_token
  ) THEN
    RAISE EXCEPTION 'Invalid invite link';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM group_members WHERE group_id = p_group_id AND user_id = auth.uid()
  ) THEN
    INSERT INTO group_members (group_id, user_id, role)
    VALUES (p_group_id, auth.uid(), 'member');
  END IF;
END;
$$;

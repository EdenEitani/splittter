-- Migration 010: Merge guest profile into real user when joining via invite link
-- When a real user joins a group, any guest profile with the same email is merged:
-- all expense/payment references are re-pointed to the real user, then the guest is deleted.

CREATE OR REPLACE FUNCTION join_group_with_invite(p_group_id uuid, p_token uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id    uuid := auth.uid();
  v_user_email text;
  v_guest_id   uuid;
BEGIN
  -- Validate token
  IF NOT EXISTS (
    SELECT 1 FROM groups WHERE id = p_group_id AND invite_token = p_token
  ) THEN
    RAISE EXCEPTION 'Invalid invite link';
  END IF;

  -- Already a real member? Nothing to do.
  IF EXISTS (
    SELECT 1 FROM group_members WHERE group_id = p_group_id AND user_id = v_user_id
  ) THEN
    RETURN;
  END IF;

  -- Get real user's email
  SELECT email INTO v_user_email
  FROM auth.users
  WHERE id = v_user_id;

  -- Find a guest profile in this group with the same email
  IF v_user_email IS NOT NULL THEN
    SELECT gm.user_id INTO v_guest_id
    FROM group_members gm
    JOIN profiles p ON p.id = gm.user_id
    WHERE gm.group_id = p_group_id
      AND p.is_guest = true
      AND lower(p.email) = lower(v_user_email)
    LIMIT 1;
  END IF;

  IF v_guest_id IS NOT NULL THEN
    -- Re-point all references from guest → real user

    UPDATE expense_participants
      SET user_id = v_user_id
      WHERE user_id = v_guest_id;

    UPDATE expenses
      SET created_by = v_user_id
      WHERE created_by = v_guest_id;

    UPDATE payments
      SET from_user_id = v_user_id
      WHERE from_user_id = v_guest_id;

    UPDATE payments
      SET to_user_id = v_user_id
      WHERE to_user_id = v_guest_id;

    UPDATE payments
      SET created_by = v_user_id
      WHERE created_by = v_guest_id;

    UPDATE groups
      SET created_by = v_user_id
      WHERE created_by = v_guest_id;

    -- Replace guest group_members row with real user
    UPDATE group_members
      SET user_id = v_user_id
      WHERE group_id = p_group_id AND user_id = v_guest_id;

    -- Clean up guest profile if no longer referenced in any group
    IF NOT EXISTS (
      SELECT 1 FROM group_members WHERE user_id = v_guest_id
    ) THEN
      DELETE FROM profiles WHERE id = v_guest_id AND is_guest = true;
    END IF;
  ELSE
    -- No guest to merge — just add as new member
    INSERT INTO group_members (group_id, user_id, role)
    VALUES (p_group_id, v_user_id, 'member');
  END IF;
END;
$$;

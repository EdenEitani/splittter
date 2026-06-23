-- Migration 011: Retroactively merge duplicate members with the same email
-- For every (group, email) pair with multiple members, keep the real (non-guest)
-- profile if one exists, otherwise keep the oldest guest. Re-point all FK
-- references from the losers to the winner, then delete the losers.

DO $$
DECLARE
  r RECORD;
  winner_id uuid;
  loser_id  uuid;
BEGIN
  -- Find every group that has >=2 members sharing the same non-null email
  FOR r IN
    SELECT
      gm.group_id,
      lower(p.email) AS email,
      array_agg(
        gm.user_id
        ORDER BY
          p.is_guest ASC,      -- real users first (is_guest=false < true)
          p.created_at ASC     -- oldest first as tiebreaker
      ) AS user_ids
    FROM group_members gm
    JOIN profiles p ON p.id = gm.user_id
    WHERE p.email IS NOT NULL
    GROUP BY gm.group_id, lower(p.email)
    HAVING count(*) > 1
  LOOP
    winner_id := r.user_ids[1];

    FOR i IN 2..array_length(r.user_ids, 1) LOOP
      loser_id := r.user_ids[i];

      -- Re-point expense_participants (skip if winner already has that row)
      UPDATE expense_participants ep
        SET user_id = winner_id
        WHERE ep.user_id = loser_id
          AND NOT EXISTS (
            SELECT 1 FROM expense_participants ep2
            WHERE ep2.expense_id = ep.expense_id
              AND ep2.user_id    = winner_id
              AND ep2.role       = ep.role
          );

      -- Delete any remaining loser rows that conflicted
      DELETE FROM expense_participants
        WHERE user_id = loser_id;

      UPDATE expenses   SET created_by    = winner_id WHERE created_by    = loser_id;
      UPDATE payments   SET created_by    = winner_id WHERE created_by    = loser_id;
      UPDATE payments   SET from_user_id  = winner_id WHERE from_user_id  = loser_id;
      UPDATE payments   SET to_user_id    = winner_id WHERE to_user_id    = loser_id;
      UPDATE groups     SET created_by    = winner_id WHERE created_by    = loser_id;

      -- Remove loser from this group
      DELETE FROM group_members
        WHERE group_id = r.group_id AND user_id = loser_id;

      -- Delete guest profile if no longer in any group
      IF NOT EXISTS (SELECT 1 FROM group_members WHERE user_id = loser_id) THEN
        DELETE FROM profiles WHERE id = loser_id AND is_guest = true;
      END IF;

    END LOOP;
  END LOOP;
END;
$$;

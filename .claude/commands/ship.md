Commit all uncommitted changes, push to GitHub, and deploy necessary changes to the Supabase project.

Steps:

1. Read the project ID:
   ```
   source .env.local && echo $SUPABASE_PROJECT_ID
   ```
   Use that value as `$PROJECT_ID` in all subsequent supabase commands.

2. Run `git status` and `git diff` in parallel to see what changed.

3. Stage everything except the temp folder:
   ```
   git add -A && git reset HEAD supabase/.temp/ 2>/dev/null; true
   ```

4. Write a concise conventional commit message (feat/fix/chore/etc.) summarising the staged changes, then commit.

5. Push to origin main.

6. Deploy to Supabase — run these in parallel:
   a. Push any pending DB migrations:
      ```
      supabase db push --linked
      ```
      If it prompts for confirmation, pipe `y` to it.
   b. Deploy all edge functions found in `supabase/functions/`:
      ```
      for fn in supabase/functions/*/; do
        supabase functions deploy "$(basename $fn)" --project-ref $PROJECT_ID
      done
      ```

7. Confirm success to the user.

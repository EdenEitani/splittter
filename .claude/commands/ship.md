Commit all uncommitted changes, push to GitHub, and deploy to Supabase.

Steps:
1. Run `git status` and `git diff` in parallel to see what changed.
2. Stage all modified/new files (excluding `supabase/.temp/`): `git add -A && git reset HEAD supabase/.temp/`
3. Write a concise conventional commit message summarising the changes (feat/fix/chore etc.), then commit.
4. Push to origin main.
5. Deploy the edge function: `supabase functions deploy categorize-expense --project-ref eygjaqwebytvnmcjzyuw`
6. Confirm success to the user.

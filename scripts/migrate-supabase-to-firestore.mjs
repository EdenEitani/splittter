import { spawn } from 'node:child_process'

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: process.platform === 'win32' })
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} ${args.join(' ')} failed with code ${code}`))
    })
  })
}

async function main() {
  await run('node', ['scripts/export-supabase-json.mjs'])
  await run('node', ['scripts/import-firestore-json.mjs'])
}

main().catch((error) => {
  console.error('\nMigration failed:\n', error)
  process.exit(1)
})

import fs from 'node:fs';
const root=new URL('../',import.meta.url);const read=p=>fs.readFileSync(new URL(p,root),'utf8');
const sql=read('supabase/migrations/20260907220000_phase12_organizations_teams_rbac.sql');const fn=read('src/lib/workspace.functions.ts');const team=read('src/routes/_app/team.tsx');const render=read('src/lib/render-pipeline.server.ts');
const checks=[
 ['organizations and members',/CREATE TABLE IF NOT EXISTS public\.organizations/.test(sql)&&/organization_members/.test(sql)],
 ['RBAC roles',/owner','admin','editor','analyst/.test(sql)],
 ['hashed expiring invitations',/token_hash/.test(sql)&&/expires_at/.test(sql)&&/phase12_accept_invitation/.test(sql)],
 ['audit log',/organization_audit_log/.test(sql)&&/member\.role_changed/.test(sql)&&/phase12_resource_audit_trigger/.test(sql)],
 ['core organization ownership',/ALTER TABLE public\.campaigns ADD COLUMN IF NOT EXISTS organization_id/.test(sql)&&/youtube_connections ADD COLUMN/.test(sql)&&/assets ADD COLUMN/.test(sql)],
 ['workspace RLS',/campaigns_org_select/.test(sql)&&/assets_org_select/.test(sql)&&/yt_org_select/.test(sql)],
 ['cross workspace channel guard',/YouTube channel belongs to another workspace/.test(sql)],
 ['cross workspace template guard',/Template belongs to another workspace/.test(sql)],
 ['team RPCs',/phase12_create_invitation/.test(sql)&&/phase12_set_member_role/.test(sql)&&/phase12_remove_member/.test(sql)],
 ['organization billing entitlement',/phase12_org_entitlement/.test(sql)&&/billing_owner_user_id/.test(sql)],
 ['team UI',/Invite teammate/.test(team)&&/Workspace YouTube channels/.test(team)&&/Audit log/.test(team)],
 ['server invitation token hashing',/createHash\("sha256"\)/.test(fn)&&/randomBytes\(32\)/.test(fn)],
 ['renderer fair tenant is organization',/tenantId: governance\.tenantId/.test(render)&&/resolveGovernanceSubject/.test(render)],
];
let fail=0;for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)fail++;}console.log(`${checks.length-fail}/${checks.length} passed`);process.exitCode=fail?1:0;

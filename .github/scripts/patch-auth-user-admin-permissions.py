from pathlib import Path
p=Path('client/src/_core/hooks/useAuth.ts')
s=p.read_text()
old='''  canAccessSettings?: boolean;\n  dashboardOnly?: boolean;'''
new='''  canAccessSettings?: boolean;\n  canAdminControl?: boolean;\n  canAdminSubscriptions?: boolean;\n  canAdminMarketing?: boolean;\n  canAdminSupport?: boolean;\n  canAdminDatabases?: boolean;\n  canAdminAudit?: boolean;\n  dashboardOnly?: boolean;'''
if new not in s:
    if old not in s: raise SystemExit('AuthUser insertion point not found')
    s=s.replace(old,new,1)
p.write_text(s)

import {notFound} from 'next/navigation';
import {RoleDemo} from '@/components/RoleDemo';
import {makeRoleDemo} from '@/lib/role-workspaces';
export const dynamic='force-dynamic';
export default function DemoPage(){if(process.env.FIRECASE_DEMO_MODE!=='true')notFound();return <RoleDemo initial={makeRoleDemo()}/>}

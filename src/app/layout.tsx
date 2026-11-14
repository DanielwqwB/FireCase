import type { Metadata } from 'next';
import './globals.css';
import 'leaflet/dist/leaflet.css';
import './workspace.css';
import './desktop-theme.css';
export const metadata:Metadata={title:'FireCase | Wildfire intelligence',description:'Wildfire monitoring, research, and incident management workspace'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}

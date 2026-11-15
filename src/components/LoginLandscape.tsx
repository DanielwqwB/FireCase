import {MapPin,Layers3} from 'lucide-react';

export function LoginLandscape(){
 return <div className="login-landscape">
  <div className="landscape-heading"><span><MapPin size={13}/> Bicol, Philippines</span><Layers3 size={16} aria-hidden="true"/></div>
  <img className="landscape-map" src="/bicol-login-map.svg" alt="Illustrated Bicol coastline showing Naga, Legazpi, and Virac" width="680" height="320"/>
  <div className="landscape-caption"><span className="landscape-rule"/><div><b>A clearer view of the landscape.</b><span>Monitor. Respond. Recover.</span></div></div>
 </div>;
}

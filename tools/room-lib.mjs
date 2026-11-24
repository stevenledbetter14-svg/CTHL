// Shared helpers for the admin room tools (backup / restore / sync-keepers).
// Firebase RTDB REST, no auth: room paths are readable (and writable) by URL,
// listing /drafts is not. Admin-only: none of this is reachable from the app.
export const DB = 'https://cthl-draft-room-default-rtdb.firebaseio.com';
export const OFFICIAL_ROOM = 'cthl-2027-draft-7dc86b95ad994b0e2663b4d963bd8551';
export const roomUrl = (room, path='') => `${DB}/drafts/${encodeURIComponent(room)}${path}.json`;

export function args(argv = process.argv.slice(2)){
  const o = {_:[]};
  for(let i=0;i<argv.length;i++){
    const a = argv[i];
    if(a.startsWith('--')){
      const [k, v] = a.slice(2).split('=');
      if(v !== undefined) o[k] = v;
      else if(argv[i+1] && !argv[i+1].startsWith('--')) o[k] = argv[++i];
      else o[k] = true;
    } else o._.push(a);
  }
  return o;
}

export async function getRoom(room){
  const r = await fetch(roomUrl(room));
  if(!r.ok) throw new Error(`GET ${room}: HTTP ${r.status} ${await r.text()}`);
  return r.json();   // null if the room does not exist
}

export const stamp = (d = new Date()) => d.toISOString().replace(/[:.]/g,'-').replace(/-\d{3}Z$/,'Z');

/* One-line counts for a room snapshot: sales / keepers / taxi / total $. */
export function counts(d){
  const picks = Object.values((d && d.picks) || {});
  const taxi = Object.values((d && d.taxi) || {});
  return {
    picks: picks.length,
    keepers: picks.filter(k => k.keeper).length,
    sales: picks.filter(k => !k.keeper && !k.taxi).length,
    taxi: taxi.length,
    dollars: picks.reduce((a,k) => a + (+k.price || 0), 0),
    seedVer: (d && d.meta && d.meta.seedVer) || null,
  };
}

import React from 'react';
import { Edges } from '@react-three/drei';

// Procedural 3D device models, built from primitives so there are no assets to host or load.
// Each one fits roughly inside a 1x1x1 cell centred on the origin (floor at y = -0.5). The node's colour
// is the body colour; fixed neutrals are used for screens, bezels, LEDs and metal.
const DARK = '#1f2937', SCREEN = '#0f172a', LIGHT = '#e5e7eb', LED = '#22c55e', GOLD = '#d4a72c', SKIN = '#f4d6b8', BLUE = '#60a5fa';

const Main = ({ color, glow }) => (
  <meshStandardMaterial color={color} roughness={0.5} metalness={0.08} emissive={glow ? color : '#000'} emissiveIntensity={glow ? 0.3 : 0} />
);
const Mat = ({ color, rough = 0.45, metal = 0.15, emissive }) => (
  <meshStandardMaterial color={color} roughness={rough} metalness={metal} emissive={emissive ?? '#000'} emissiveIntensity={emissive ? 0.6 : 0} />
);
const Box = ({ size, pos = [0, 0, 0], rot, children }) => (
  <mesh position={pos} rotation={rot}><boxGeometry args={size} />{children}</mesh>
);

function User({ color, glow }) {
  return (
    <group>
      <mesh position={[0, -0.15, 0]}><capsuleGeometry args={[0.27, 0.16, 6, 20]} /><Main color={color} glow={glow} /></mesh>
      <mesh position={[0, 0.4, 0]}><sphereGeometry args={[0.22, 28, 20]} /><Mat color={SKIN} rough={0.7} metal={0} /></mesh>
    </group>
  );
}

function Server({ color, glow }) {
  return (
    <group>
      {[-0.36, -0.04, 0.28].map((y, i) => (
        <group key={i} position={[0, y, 0]}>
          <Box size={[0.92, 0.27, 0.72]}><Main color={color} glow={glow} /></Box>
          <Box size={[0.8, 0.15, 0.01]} pos={[0, 0, 0.362]}><Mat color={DARK} /></Box>
          <Box size={[0.05, 0.05, 0.012]} pos={[-0.3, 0, 0.37]}><Mat color={LED} emissive={LED} /></Box>
          <Box size={[0.3, 0.025, 0.012]} pos={[0.2, 0.03, 0.37]}><Mat color={LIGHT} /></Box>
          <Box size={[0.3, 0.025, 0.012]} pos={[0.2, -0.03, 0.37]}><Mat color={LIGHT} /></Box>
        </group>
      ))}
    </group>
  );
}

function Router({ color, glow }) {
  return (
    <group>
      <Box size={[1, 0.2, 0.68]} pos={[0, -0.4, 0]}><Main color={color} glow={glow} /></Box>
      <Box size={[0.86, 0.08, 0.01]} pos={[0, -0.41, 0.342]}><Mat color={DARK} /></Box>
      {[-0.3, -0.15, 0, 0.15].map((x) => (
        <Box key={x} size={[0.06, 0.02, 0.06]} pos={[x, -0.29, 0.22]}><Mat color={LED} emissive={LED} /></Box>
      ))}
      {[-0.36, 0.36].map((x) => (
        <group key={x} position={[x, -0.3, -0.22]} rotation={[0, 0, -x * 0.5]}>
          <mesh position={[0, 0.3, 0]}><cylinderGeometry args={[0.035, 0.035, 0.6, 12]} /><Mat color={DARK} /></mesh>
          <mesh position={[0, 0.6, 0]}><sphereGeometry args={[0.05, 12, 10]} /><Mat color={DARK} /></mesh>
        </group>
      ))}
    </group>
  );
}

function AccessPoint({ color, glow }) {
  return (
    <group>
      <mesh position={[0, -0.45, 0]}><cylinderGeometry args={[0.46, 0.46, 0.1, 40]} /><Mat color={LIGHT} /></mesh>
      <mesh position={[0, -0.4, 0]}><sphereGeometry args={[0.3, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} /><Main color={color} glow={glow} /></mesh>
      <mesh position={[0, -0.18, 0.2]}><sphereGeometry args={[0.03, 10, 8]} /><Mat color={LED} emissive={LED} /></mesh>
      {[[0.1, 0.34], [0.34, 0.2]].map(([y, r]) => (
        <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} userData={{ noShadow: true }}>
          <torusGeometry args={[r, 0.02, 8, 40]} />
          <meshStandardMaterial color={color} transparent opacity={0.65} roughness={0.4} />
        </mesh>
      ))}
    </group>
  );
}

function Pc({ color, glow }) {
  return (
    <group scale={0.95}>
      <Box size={[0.4, 0.92, 0.7]} pos={[-0.32, -0.04, 0]}><Main color={color} glow={glow} /></Box>
      <Box size={[0.3, 0.06, 0.01]} pos={[-0.32, 0.25, 0.352]}><Mat color={DARK} /></Box>
      <Box size={[0.3, 0.06, 0.01]} pos={[-0.32, 0.15, 0.352]}><Mat color={DARK} /></Box>
      <mesh position={[-0.32, -0.3, 0.355]}><sphereGeometry args={[0.035, 12, 10]} /><Mat color={LED} emissive={LED} /></mesh>
      <Box size={[0.34, 0.04, 0.3]} pos={[0.24, -0.48, 0]}><Mat color={DARK} /></Box>
      <mesh position={[0.24, -0.34, 0]}><cylinderGeometry args={[0.04, 0.04, 0.26, 12]} /><Mat color={DARK} /></mesh>
      <Box size={[0.66, 0.46, 0.06]} pos={[0.24, 0, 0]}><Mat color={DARK} /></Box>
      <Box size={[0.58, 0.38, 0.01]} pos={[0.24, 0, 0.032]}><Mat color={BLUE} emissive={BLUE} /></Box>
    </group>
  );
}

function Laptop({ color, glow }) {
  return (
    <group>
      <Box size={[1, 0.06, 0.7]} pos={[0, -0.47, 0.02]}><Main color={color} glow={glow} /></Box>
      <Box size={[0.84, 0.01, 0.38]} pos={[0, -0.437, -0.02]}><Mat color={DARK} /></Box>
      <Box size={[0.3, 0.01, 0.14]} pos={[0, -0.437, 0.22]}><Mat color={LIGHT} /></Box>
      <group position={[0, -0.44, -0.33]} rotation={[-0.32, 0, 0]}>
        <Box size={[1, 0.66, 0.04]} pos={[0, 0.33, 0]}><Main color={color} glow={glow} /></Box>
        <Box size={[0.9, 0.56, 0.01]} pos={[0, 0.33, 0.022]}><Mat color={SCREEN} /></Box>
        <Box size={[0.8, 0.46, 0.005]} pos={[0, 0.33, 0.03]}><Mat color={BLUE} emissive={BLUE} /></Box>
      </group>
    </group>
  );
}

function Phone({ color, glow }) {
  return (
    <group>
      <Box size={[0.44, 0.84, 0.08]} pos={[0, -0.08, 0]}><Main color={color} glow={glow} /></Box>
      <Box size={[0.38, 0.72, 0.01]} pos={[0, -0.06, 0.042]}><Mat color={SCREEN} /></Box>
      <Box size={[0.32, 0.6, 0.005]} pos={[0, -0.06, 0.05]}><Mat color={BLUE} emissive={BLUE} /></Box>
      <mesh position={[0, 0.27, 0.046]}><sphereGeometry args={[0.018, 8, 6]} /><Mat color="#000" /></mesh>
    </group>
  );
}

function Database({ color, glow }) {
  return (
    <group>
      {[-0.365, -0.065, 0.235].map((y, i) => (
        <group key={i} position={[0, y, 0]}>
          <mesh><cylinderGeometry args={[0.42, 0.42, 0.27, 40]} /><Main color={color} glow={glow} /></mesh>
          <mesh position={[0, 0.02, 0]}><cylinderGeometry args={[0.425, 0.425, 0.04, 40]} /><Mat color={LIGHT} metal={0.3} /></mesh>
          <mesh position={[0.28, -0.06, 0.3]}><sphereGeometry args={[0.03, 10, 8]} /><Mat color={LED} emissive={LED} /></mesh>
        </group>
      ))}
    </group>
  );
}

function Cache({ color, glow }) {
  const pins = [-0.3, -0.15, 0, 0.15, 0.3];
  return (
    <group>
      <Box size={[0.86, 0.12, 0.86]} pos={[0, -0.44, 0]}><Main color={color} glow={glow} /></Box>
      <Box size={[0.52, 0.1, 0.52]} pos={[0, -0.33, 0]}><Mat color={DARK} /></Box>
      <Box size={[0.2, 0.012, 0.2]} pos={[0.1, -0.277, 0.1]}><Mat color={GOLD} metal={0.5} emissive={GOLD} /></Box>
      {pins.map((p) => (
        <group key={p}>
          <Box size={[0.07, 0.04, 0.14]} pos={[p, -0.44, 0.5]}><Mat color={GOLD} metal={0.6} /></Box>
          <Box size={[0.07, 0.04, 0.14]} pos={[p, -0.44, -0.5]}><Mat color={GOLD} metal={0.6} /></Box>
          <Box size={[0.14, 0.04, 0.07]} pos={[0.5, -0.44, p]}><Mat color={GOLD} metal={0.6} /></Box>
          <Box size={[0.14, 0.04, 0.07]} pos={[-0.5, -0.44, p]}><Mat color={GOLD} metal={0.6} /></Box>
        </group>
      ))}
    </group>
  );
}


function Switch({ color, glow }) {
  return (
    <group>
      <Box size={[1.1, 0.2, 0.72]} pos={[0, -0.4, 0]}><Main color={color} glow={glow} /></Box>
      <Box size={[0.96, 0.09, 0.01]} pos={[0, -0.4, 0.362]}><Mat color={DARK} /></Box>
      {Array.from({ length: 8 }, (_, i) => (
        <Box key={i} size={[0.07, 0.05, 0.012]} pos={[-0.4 + i * 0.115, -0.4, 0.37]}><Mat color={i % 3 === 0 ? LED : LIGHT} emissive={i % 3 === 0 ? LED : undefined} /></Box>
      ))}
      <Box size={[0.3, 0.02, 0.2]} pos={[0.3, -0.295, 0]}><Mat color={LIGHT} /></Box>
    </group>
  );
}

function Firewall({ color, glow }) {
  const rows = [0, 1, 2, 3, 4];
  return (
    <group>
      {rows.map((r) => {
        const y = -0.42 + r * 0.19;
        const xs = r % 2 === 0 ? [-0.33, 0, 0.33] : [-0.495, -0.165, 0.165, 0.495];
        return xs.map((x) => {
          const w = r % 2 === 0 || Math.abs(x) < 0.4 ? 0.31 : 0.15;
          return <Box key={`${r}${x}`} size={[w, 0.17, 0.3]} pos={[x, y, 0]}><Main color={color} glow={glow} /></Box>;
        });
      })}
      <Box size={[0.22, 0.17, 0.07]} pos={[0.3, -0.3, 0.19]}><Mat color={GOLD} metal={0.6} /></Box>
      <mesh position={[0.3, -0.2, 0.19]}><torusGeometry args={[0.07, 0.022, 8, 18, Math.PI]} /><Mat color={GOLD} metal={0.6} /></mesh>
    </group>
  );
}

function Cloud({ color, glow }) {
  return (
    <group>
      <mesh position={[0, -0.3, 0]} scale={[1.5, 0.5, 1]}><sphereGeometry args={[0.36, 28, 18]} /><Main color={color} glow={glow} /></mesh>
      <mesh position={[-0.28, -0.13, 0]}><sphereGeometry args={[0.28, 28, 20]} /><Main color={color} glow={glow} /></mesh>
      <mesh position={[0.04, 0.02, 0.02]}><sphereGeometry args={[0.37, 28, 20]} /><Main color={color} glow={glow} /></mesh>
      <mesh position={[0.32, -0.15, 0]}><sphereGeometry args={[0.26, 28, 20]} /><Main color={color} glow={glow} /></mesh>
    </group>
  );
}

function Antenna({ color, glow }) {
  return (
    <group>
      <mesh position={[0, -0.47, 0]}><cylinderGeometry args={[0.42, 0.46, 0.06, 32]} /><Mat color={DARK} /></mesh>
      <mesh position={[0, 0.2, 0]} rotation={[0, Math.PI / 4, 0]} userData={{ noShadow: true }}>
        <cylinderGeometry args={[0.02, 0.3, 1.3, 4, 9, true]} />
        <meshStandardMaterial color={color} wireframe emissive={glow ? color : '#000'} emissiveIntensity={glow ? 0.5 : 0} />
      </mesh>
      <mesh position={[0, 0.2, 0]}><cylinderGeometry args={[0.025, 0.04, 1.3, 8]} /><Main color={color} glow={glow} /></mesh>
      {/* shadow-only solid: the wireframe lattice itself casts nothing, so a slim invisible mast stands in for it */}
      <mesh position={[0, 0.2, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <cylinderGeometry args={[0.03, 0.2, 1.3, 4]} />
        <meshBasicMaterial colorWrite={false} depthWrite={false} />
      </mesh>
      <Box size={[0.34, 0.025, 0.025]} pos={[0, 0.5, 0]}><Mat color={DARK} /></Box>
      <Box size={[0.22, 0.025, 0.025]} pos={[0, 0.2, 0]}><Mat color={DARK} /></Box>
      <mesh position={[0, 0.88, 0]}><sphereGeometry args={[0.05, 12, 10]} /><Mat color="#ef4444" emissive="#ef4444" /></mesh>
    </group>
  );
}

function Printer({ color, glow }) {
  return (
    <group>
      <Box size={[0.95, 0.3, 0.62]} pos={[0, -0.35, 0.04]}><Main color={color} glow={glow} /></Box>
      <Box size={[0.95, 0.08, 0.58]} pos={[0, -0.16, 0.04]}><Mat color={LIGHT} /></Box>
      <Box size={[0.5, 0.02, 0.4]} pos={[0, 0.0, -0.22]} rot={[-0.55, 0, 0]}><Mat color="#f8fafc" rough={0.9} metal={0} /></Box>
      <Box size={[0.7, 0.04, 0.3]} pos={[0, -0.45, 0.4]}><Mat color={DARK} /></Box>
      <Box size={[0.2, 0.05, 0.01]} pos={[0.3, -0.3, 0.353]}><Mat color={LED} emissive={LED} /></Box>
    </group>
  );
}

function Pyramid({ color, glow }) {
  return (
    <mesh position={[0, -0.08, 0]} rotation={[0, Math.PI / 4, 0]}>
      <coneGeometry args={[0.66, 0.84, 4]} /><Main color={color} glow={glow} />
    </mesh>
  );
}

function Container({ color, glow }) {
  return (
    <group>
      <mesh userData={{ noShadow: true }}>
        <boxGeometry args={[0.95, 0.95, 0.95]} />
        <meshStandardMaterial color={color} transparent opacity={0.2} depthWrite={false} roughness={0.15} />
        <Edges color={DARK} />
      </mesh>
      {[-0.2, 0.06].map((y) => <Box key={y} size={[0.62, 0.18, 0.62]} pos={[0, y, 0]}><Main color={color} glow={glow} /></Box>)}
      <Box size={[0.62, 0.05, 0.62]} pos={[0, -0.4, 0]}><Mat color={LIGHT} /></Box>
      <Box size={[0.5, 0.05, 0.5]} pos={[0, 0.27, 0]}><Mat color={LIGHT} /></Box>
    </group>
  );
}

export const MODELS = { user: User, server: Server, router: Router, accesspoint: AccessPoint, pc: Pc, laptop: Laptop, phone: Phone, database: Database, cache: Cache, switch: Switch, firewall: Firewall, cloud: Cloud, antenna: Antenna, printer: Printer, pyramid: Pyramid, container: Container };
export const isModel = (kind) => kind in MODELS;

// Height (world units, above the node centre) at which the DOM label floats, per model.
export const LABEL_Y = { switch: 0.5, firewall: 0.75, cloud: 0.7, antenna: 1.3, printer: 0.55, pyramid: 0.6, container: 0.95, user: 0.95, server: 0.85, router: 0.95, accesspoint: 0.8, pc: 0.8, laptop: 0.7, phone: 0.65, database: 0.75, cache: 0.35, slab: 0.55 };

export function Model({ kind, color, glow }) {
  const C = MODELS[kind];
  return C ? <C color={color} glow={glow} /> : null;
}

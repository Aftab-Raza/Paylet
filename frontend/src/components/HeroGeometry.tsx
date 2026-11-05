/** Decorative vector only: no canvas, external asset or runtime animation dependency. */
export default function HeroGeometry() {
  return <div className="hero-geometry" aria-hidden="true">
    <svg viewBox="0 0 520 520" fill="none" focusable="false">
      <g className="hero-geometry-orbit" stroke="currentColor" strokeWidth="0.8">
        {Array.from({ length: 18 }, (_, index) => <ellipse key={index} cx="260" cy="260" rx="188" ry="74" transform={`rotate(${index * 10} 260 260)`} opacity={index % 3 === 0 ? 0.8 : 0.32}/>)}
        <circle cx="260" cy="260" r="188" opacity="0.55"/>
        <circle cx="260" cy="260" r="116" opacity="0.2"/>
        {[0, 60, 120].map(angle => <ellipse key={angle} cx="260" cy="260" rx="208" ry="104" transform={`rotate(${angle} 260 260)`} strokeWidth="1.4" opacity="0.85"/>)}
      </g>
    </svg>
  </div>;
}

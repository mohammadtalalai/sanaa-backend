import { useApp } from '@/fos/context/AppContext';

export default function PreviewModel() {
  const { width, height, depth, doors, wood, opened, view, dimensions, zoom, setZoom, orbit, setOrbit, t } =
    useApp();
  return (
    <>
      <div
        className={`model-scene ${view}`}
        onWheel={(e) => setZoom((z) => Math.max(0.6, Math.min(1.4, z - e.deltaY * 0.001)))}
        onDoubleClick={() => {
          setZoom(1);
          setOrbit(-24);
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (e.buttons) setOrbit((v) => v + e.movementX * 0.4);
        }}
      >
        <div className="floor-shadow" />
        <div
          className={`wardrobe wood-${wood}`}
          style={{
            transform: `scale(${zoom}) rotateX(-7deg) rotateY(${view === 'front' ? 0 : view === 'side' ? 65 : view === 'top' ? 15 : orbit}deg)`,
            width: `${Math.min(350, width * 1.6)}px`,
            height: `${Math.min(400, height * 1.65)}px`,
          }}
        >
          <div className="cabinet-side" />
          <div className="cabinet-top" />
          {Array.from({ length: doors }, (_, i) => (
            <div key={i} className={`cabinet-door ${opened ? 'open' : ''}`}>
              <div className="grain" />
              <div className="handle" />
              {opened && <div className="shelves" />}
            </div>
          ))}
          <div className="cabinet-base" />
        </div>
        {dimensions && (
          <>
            <span className="dim width-dim">
              {width} {t('سم', 'cm')}
            </span>
            <span className="dim height-dim">
              {height} {t('سم', 'cm')}
            </span>
            <span className="dim depth-dim">
              {depth} {t('سم', 'cm')}
            </span>
          </>
        )}
        <span className="viewer-note">
          {t('معاينة توضيحية تفاعلية · اسحب للدوران', 'Interactive illustration · drag to rotate')}
        </span>
      </div>
    </>
  );
}

import { createElement, useEffect, useState } from 'react';
import { useApp } from '@/fos/context/AppContext';
import { WOOD_OPTIONS } from '@/fos/context/useAppState';

// The 3D viewer only works in a browser, so it is loaded from its CDN at runtime
// instead of being bundled (a bundled copy gets evaluated on the server and crashes every page).
const VIEWER_SRC = 'https://ajax.googleapis.com/ajax/libs/model-viewer/4.0.0/model-viewer.min.js';
let viewerPromise: Promise<void> | null = null;
function loadViewer(): Promise<void> {
  if (customElements.get('model-viewer')) return Promise.resolve();
  viewerPromise ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.type = 'module';
    s.src = VIEWER_SRC;
    s.onload = () => customElements.whenDefined('model-viewer').then(() => resolve());
    s.onerror = () => { viewerPromise = null; reject(new Error('3D viewer failed to load')); };
    document.head.appendChild(s);
  });
  return viewerPromise;
}

/** Real 3D model (GLB built by the server from the exact dimensions). Loaded only in the browser. */
export default function Model3D() {
  const { productKey, width, height, depth, wood, dimsValid, t } = useApp();
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  useEffect(() => {
    loadViewer().then(() => setState('ready'), () => setState('failed'));
  }, []);
  if (!dimsValid) return <div className="empty">{t('المقاسات خارج المسموح', 'Dimensions out of range')}</div>;
  const w = WOOD_OPTIONS[wood]!;
  const src = `/api/design-preview/model.glb?${new URLSearchParams({
    product_type: productKey, width_cm: String(width), depth_cm: String(depth), height_cm: String(height), wood: w.wood, finish: w.finish, color: w.color,
  })}`;
  if (state === 'failed') return <div className="empty">{t('تعذر تحميل العرض ثلاثي الأبعاد', 'Could not load the 3D view')}</div>;
  if (state === 'loading') return <div className="empty">{t('جارٍ تحميل العرض ثلاثي الأبعاد...', 'Loading 3D view...')}</div>;
  return createElement('model-viewer', {
    src, 'camera-controls': true, 'auto-rotate': true, 'shadow-intensity': '1', ar: true, alt: '3D design',
    class: 'model-3d',
  });
}

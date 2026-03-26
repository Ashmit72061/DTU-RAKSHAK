import React, { useEffect, useMemo, useState } from 'react';
import { Polyline, Marker, InfoWindow } from '@react-google-maps/api';

export default function PathRenderer({ path, mapInstance }) {
  const [activeMarker, setActiveMarker] = useState(null);

  // Derive bounds from path and fit map whenever path changes
  useEffect(() => {
    if (path.length > 0 && mapInstance && window.google) {
      if (path.length === 1) {
        // For a single point, fitBounds on bounding boxes fails because the area is zero.
        mapInstance.panTo({ lat: path[0].lat, lng: path[0].lng });
        mapInstance.setZoom(18); // Optimal zoom for a parking/gate area
      } else {
        const bounds = new window.google.maps.LatLngBounds();
        path.forEach(p => {
          bounds.extend({ lat: p.lat, lng: p.lng });
        });
        // Add slight padding around the path
        mapInstance.fitBounds(bounds, { top: 50, right: 50, bottom: 50, left: 50 });
      }
    }
  }, [path, mapInstance]);

  const polylineOptions = useMemo(() => ({
    strokeColor: '#3b82f6', // blue-500
    strokeOpacity: 0.8,
    strokeWeight: 4,
    geodesic: true,
  }), []);

  if (!path || path.length === 0) return null;

  return (
    <>
      <Polyline path={path} options={polylineOptions} />
      
      {path.map((point, index) => {
        return (
          <Marker
            key={`${point.cameraId}-${point.timestamp}-${index}`}
            position={{ lat: point.lat, lng: point.lng }}
            label={{
              text: String(index + 1),
              color: '#ffffff',
              fontSize: '11px',
              fontWeight: 'bold',
            }}
            icon={{
              path: window.google.maps.SymbolPath.CIRCLE,
              scale: 9,
              fillColor: '#3b82f6', // Uniform deep blue
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 2,
            }}
            onClick={() => setActiveMarker(index)}
            onMouseOver={() => setActiveMarker(index)}
            onMouseOut={() => setActiveMarker(null)}
          >
            {activeMarker === index && (
              <InfoWindow
                position={{ lat: point.lat, lng: point.lng }}
                onCloseClick={() => setActiveMarker(null)}
                options={{ pixelOffset: new window.google.maps.Size(0, -10) }}
              >
                <div style={{ padding: '2px 4px', fontSize: '13px', color: '#1f2937' }}>
                  <div style={{ fontWeight: 600, marginBottom: '2px' }}>
                    {point.cameraLocation || point.cameraId}
                  </div>
                  <div>{new Date(point.timestamp).toLocaleString()}</div>
                </div>
              </InfoWindow>
            )}
          </Marker>
        );
      })}
    </>
  );
}

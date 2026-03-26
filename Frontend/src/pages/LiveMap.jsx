import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { GoogleMap, useJsApiLoader, Polygon } from '@react-google-maps/api';
import PathRenderer from '../components/PathRenderer';
import { getEntryPath } from '../api';
import GeoJSON from '../assets/dtu_boundary.geojson?url';

const mapContainerStyle = {
  width: '100%',
  height: '100%',
};

const defaultCenter = { lat: 28.7499, lng: 77.1176 };

const options = {
  disableDefaultUI: true,
  zoomControl: true,
  zoomControlOptions: { position: 9 }, // RIGHT_BOTTOM / RIGHT_CENTER approximately
  mapTypeControl: true,
  streetViewControl: false,
  fullscreenControl: false,
  maxZoom: 20,
  minZoom: 14,
  restriction: {
    latLngBounds: {
      north: 28.7650,
      south: 28.7350,
      east: 77.1350,
      west: 77.1000,
    },
    strictBounds: false,
  },
  styles: [
    { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
    { featureType: 'transit', elementType: 'labels', stylers: [{ visibility: 'off' }] }
  ]
};

// Define a large bounding box around Delhi rather than the entire globe 
// to prevent Google Maps geometry wrapping errors which throw out the outer mask.
const worldOuterCoords = [
  { lat: 30.0, lng: 76.0 }, // NW
  { lat: 27.0, lng: 76.0 }, // SW
  { lat: 27.0, lng: 78.0 }, // SE
  { lat: 30.0, lng: 78.0 }, // NE
  { lat: 30.0, lng: 76.0 }, // NW
];

export default function LiveMap() {
  const [searchParams] = useSearchParams();
  const entryIdFromUrl = searchParams.get('entryId');

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
  });

  const [pathData, setPathData] = useState([]);
  const [loadingPath, setLoadingPath] = useState(false);
  const [campusInnerCoords, setCampusInnerCoords] = useState([]);
  
  const mapRef = useRef(null);
  
  const onLoad = useCallback(function callback(map) {
    mapRef.current = map;
    
    // Load GeoJSON to extract inner boundary for the inverted mask
    fetch(GeoJSON)
      .then(res => res.json())
      .then(data => {
        const feature = data.features[0];
        if (feature && feature.geometry.type === 'Polygon') {
          const coords = feature.geometry.coordinates[0].map(coord => ({
            lat: coord[1],
            lng: coord[0]
          })).reverse(); // Reverse winding order to create a valid hole
          setCampusInnerCoords(coords);
          
          // Fit map to boundary
          const bounds = new window.google.maps.LatLngBounds();
          coords.forEach(coord => bounds.extend(coord));
          map.fitBounds(bounds);
        }
      })
      .catch(console.error);
  }, []);

  const onUnmount = useCallback(function callback() {
    mapRef.current = null;
  }, []);

  const fetchPath = async (entryId) => {
    try {
      setLoadingPath(true);
      const res = await getEntryPath(entryId);
      setPathData(res.data.data.path || []);
    } catch (err) {
      console.error(err);
      setPathData([]);
    } finally {
      setLoadingPath(false);
    }
  };

  useEffect(() => {
    if (entryIdFromUrl) {
      fetchPath(entryIdFromUrl);
    }
  }, [entryIdFromUrl]);

  if (loadError) return <div className="main">Error loading Google Maps</div>;
  if (!isLoaded) return <div className="main">Loading Map...</div>;

  return (
    <div className="main" style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#f3f4f6' }}>
      <div style={{ position: 'relative', height: '60vh', flexShrink: 0 }}>
        <GoogleMap
          mapContainerStyle={mapContainerStyle}
          center={defaultCenter}
          zoom={16}
          options={options}
          onLoad={onLoad}
          onUnmount={onUnmount}
        >
          {/* Inverted Mask Polygon */}
          {campusInnerCoords.length > 0 && window.google && (
            <Polygon
              paths={[worldOuterCoords, campusInnerCoords]}
              options={{
                fillColor: '#ffffff',
                fillOpacity: 1, // Completely block
                strokeColor: 'transparent', // No outline
                strokeWeight: 0,
                strokeOpacity: 0,
                clickable: false,
              }}
            />
          )}
          
          {pathData.length > 0 && <PathRenderer path={pathData} mapInstance={mapRef.current} />}
        </GoogleMap>
      </div>

      <div style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', overflow: 'hidden' }}>
          <div style={{ padding: '20px', borderBottom: '1px solid #e5e7eb' }}>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#111827' }}>Vehicle Sightings Timeline</h2>
            <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: '#6b7280' }}>Chronological order of camera detections</p>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead style={{ backgroundColor: '#f9fafb' }}>
                <tr>
                  <th style={thStyle}>Order</th>
                  <th style={thStyle}>Camera Location</th>
                  <th style={thStyle}>Camera ID</th>
                  <th style={thStyle}>Timestamp</th>
                </tr>
              </thead>
              <tbody style={{ borderTop: '1px solid #e5e7eb' }}>
                {pathData.map((point, index) => (
                  <tr key={index} style={{ borderBottom: '1px solid #e5e7eb', backgroundColor: index % 2 === 0 ? '#ffffff' : '#f9fafb' }}>
                    <td style={tdStyle}>
                      <span style={{ 
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', 
                        width: '28px', height: '28px', borderRadius: '50%', 
                        backgroundColor: '#eff6ff', color: '#1d4ed8', 
                        fontSize: '13px', fontWeight: '600' 
                      }}>
                        {index + 1}
                      </span>
                    </td>
                    <td style={{...tdStyle, fontWeight: '500', color: '#111827'}}>{point.cameraLocation || 'Unknown'}</td>
                    <td style={{...tdStyle, color: '#6b7280', fontFamily: 'monospace'}}>{point.cameraId}</td>
                    <td style={tdStyle}>{new Date(point.timestamp).toLocaleString(undefined, {
                      dateStyle: 'medium',
                      timeStyle: 'medium'
                    })}</td>
                  </tr>
                ))}
                {pathData.length === 0 && (
                  <tr>
                    <td colSpan="4" style={{ padding: '24px', textAlign: 'center', color: '#6b7280' }}>
                      {loadingPath ? 'Loading path data...' : 'No sightings found.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

const thStyle = {
  padding: '12px 24px',
  fontSize: '12px',
  fontWeight: '600',
  color: '#374151',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  borderBottom: '1px solid #e5e7eb'
};

const tdStyle = {
  padding: '16px 24px',
  fontSize: '14px',
  whiteSpace: 'nowrap'
};

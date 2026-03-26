import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { GoogleMap, useJsApiLoader } from '@react-google-maps/api';
import PathRenderer from './PathRenderer';
import { getEntryPath } from '../api';
import GeoJSON from '../assets/dtu_boundary.geojson?url';

const mapContainerStyle = {
  width: '100%',
  height: '100%',
  borderRadius: '8px',
};

// Initial DTU Campus approximation
const defaultCenter = { lat: 28.7499, lng: 77.1176 };

const options = {
  disableDefaultUI: true,
  zoomControl: true,
  mapTypeControl: true,
  streetViewControl: false,
  fullscreenControl: true,
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

export default function MapView({ selectedEntryId }) {
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
  });

  const [pathData, setPathData] = useState([]);
  const [loadingPath, setLoadingPath] = useState(false);
  const mapRef = useRef(null);
  
  const onLoad = useCallback(function callback(map) {
    mapRef.current = map;
    // Load GeoJSON boundary
    fetch(GeoJSON)
      .then(res => res.json())
      .then(data => {
        map.data.addGeoJson(data);
        map.data.setStyle({
          fillColor: '#2563eb', // blue-600
          fillOpacity: 0.1,
          strokeColor: '#1d4ed8', // blue-700
          strokeWeight: 2,
        });

        // Fit map to GeoJSON bounds
        const bounds = new window.google.maps.LatLngBounds();
        data.features.forEach(feature => {
          if (feature.geometry.type === 'Polygon') {
            feature.geometry.coordinates[0].forEach(coord => {
              bounds.extend(new window.google.maps.LatLng(coord[1], coord[0]));
            });
          }
        });
        map.fitBounds(bounds);
      })
      .catch(console.error);
  }, []);

  const onUnmount = useCallback(function callback() {
    mapRef.current = null;
  }, []);

  useEffect(() => {
    if (!selectedEntryId) {
      setPathData([]);
      return;
    }

    setLoadingPath(true);
    getEntryPath(selectedEntryId)
      .then(res => {
        setPathData(res.data.data.path || []);
      })
      .catch(console.error)
      .finally(() => setLoadingPath(false));
  }, [selectedEntryId]);

  if (loadError) return <div className="map-error">Error loading Google Maps</div>;
  if (!isLoaded) return <div className="map-loading">Loading Map...</div>;

  return (
    <div className="map-wrapper" style={{ position: 'relative', width: '100%', height: '100%', minHeight: '400px' }}>
      <GoogleMap
        mapContainerStyle={mapContainerStyle}
        center={defaultCenter}
        zoom={16}
        options={options}
        onLoad={onLoad}
        onUnmount={onUnmount}
      >
        {pathData.length > 0 && <PathRenderer path={pathData} mapInstance={mapRef.current} />}
      </GoogleMap>
      
      {loadingPath && (
        <div className="map-loader-overlay" style={overlayStyle}>
          <span className="spinner"></span> Loading Path...
        </div>
      )}
      {!selectedEntryId && !loadingPath && (
        <div className="map-hint-overlay" style={hintStyle}>
          Select a vehicle log from the table to view its path
        </div>
      )}
    </div>
  );
}

const overlayStyle = {
  position: 'absolute',
  top: '10px',
  left: '50%',
  transform: 'translateX(-50%)',
  backgroundColor: 'rgba(255, 255, 255, 0.9)',
  padding: '8px 16px',
  borderRadius: '20px',
  boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  fontSize: '14px',
  fontWeight: '500',
  zIndex: 10
};

const hintStyle = {
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  backgroundColor: 'rgba(255,255,255,0.85)',
  padding: '12px 24px',
  borderRadius: '8px',
  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
  fontSize: '14px',
  color: '#4b5563',
  backdropFilter: 'blur(4px)',
  zIndex: 10
};

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { GoogleMap, useJsApiLoader, Polygon } from '@react-google-maps/api';
import { Search } from 'lucide-react';
import PathRenderer from '../components/PathRenderer';
import { getEntryPath, getVehicleLogs } from '../api';
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
  
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResultMsg, setSearchResultMsg] = useState('');
  
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
      setSearchResultMsg('');
      const res = await getEntryPath(entryId);
      setPathData(res.data.data.path || []);
    } catch (err) {
      console.error(err);
      setSearchResultMsg('Path not found');
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

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    try {
      setLoadingPath(true);
      setSearchResultMsg('Searching...');
      
      const res = await getVehicleLogs(searchQuery.toUpperCase());
      const logs = res.data.data.logs;
      if (logs && logs.length > 0) {
        // Find most recent active log or just the most recent log
        const activeLog = logs.find(l => !l.exitTime) || logs[0];
        setSearchResultMsg(`Found path for ${activeLog.vehicleNo}`);
        fetchPath(activeLog.id);
      } else {
        setSearchResultMsg('Vehicle not found');
        setPathData([]);
      }
    } catch {
      setSearchResultMsg('Vehicle not found');
      setPathData([]);
    } finally {
      setLoadingPath(false);
    }
  };

  if (loadError) return <div className="main">Error loading Google Maps</div>;
  if (!isLoaded) return <div className="main">Loading Map...</div>;

  return (
    <div className="main" style={{ padding: 0, position: 'relative', height: '100vh' }}>
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
      
      {/* Floating Search Bar mimicking Maps */}
      <div style={floatingSearchStyle}>
        <form onSubmit={handleSearch} style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
          <button type="submit" style={searchBtnStyle}>
            <Search size={20} color="#5f6368" />
          </button>
          <input 
            type="text" 
            placeholder="Search vehicle plate number" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={searchInputStyle}
          />
        </form>
        {searchResultMsg && (
          <div style={{ padding: '8px 16px', fontSize: '13px', color: '#5f6368', borderTop: '1px solid #e8eaed' }}>
            {searchResultMsg}
          </div>
        )}
        {loadingPath && (
          <div style={{ padding: '8px 16px', fontSize: '13px', color: '#1a73e8', borderTop: '1px solid #e8eaed' }}>
            Loading Path...
          </div>
        )}
      </div>
    </div>
  );
}

const floatingSearchStyle = {
  position: 'absolute',
  top: '24px',
  left: '24px',
  width: '380px',
  backgroundColor: '#fff',
  borderRadius: '8px',
  boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
  zIndex: 10,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden'
};

const searchInputStyle = {
  flex: 1,
  border: 'none',
  padding: '12px 16px',
  fontSize: '15px',
  outline: 'none',
  color: '#3c4043'
};

const searchBtnStyle = {
  background: 'none',
  border: 'none',
  padding: '12px 16px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center'
};

import React, { useState, useEffect, useMemo } from 'react';
import {
  MapContainer,
  TileLayer,
  Polygon as LeafletPolygon,
  Marker,
  Popup,
  Polyline,
  useMapEvents,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import {
  Pencil,
  Trash2,
  RotateCcw,
  Check,
  X,
  AlertTriangle,
  Layers,
  Info,
  Navigation,
} from 'lucide-react';
import { FarmBoundary, GeoJSONPolygon } from '../../types';
import { farmBoundaryService } from '../../services/farmBoundaryService';
import { LoadingSpinner } from '../LoadingSpinner';

// Custom icons using L.divIcon to avoid asset bundling path issues
const centroidIcon = L.divIcon({
  className: 'custom-centroid-marker',
  html: `<div class="w-7 h-7 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-lg ring-4 ring-emerald-100 font-bold text-xs border border-white">
    📍
  </div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

const vertexIcon = (index: number) =>
  L.divIcon({
    className: 'custom-vertex-marker',
    html: `<div class="w-6 h-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-md ring-2 ring-white font-mono font-bold text-[10px]">
    ${index + 1}
  </div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });

interface FarmBoundaryMapProps {
  farmId: string;
  farmName: string;
  initialBoundary: FarmBoundary | null;
  onBoundaryUpdated: (boundary: FarmBoundary | null) => void;
}

// Helper to center and zoom the map
const MapViewController: React.FC<{
  center: [number, number];
  zoom: number;
  bounds?: [number, number][];
}> = ({ center, zoom, bounds }) => {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.length > 2) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 18 });
    } else {
      map.setView(center, zoom);
    }
  }, [center, zoom, bounds, map]);
  return null;
};

// Map click listener for placing vertices in draw mode
const MapDrawingListener: React.FC<{
  isDrawing: boolean;
  onAddVertex: (lat: number, lng: number) => void;
}> = ({ isDrawing, onAddVertex }) => {
  useMapEvents({
    click(e) {
      if (!isDrawing) return;
      onAddVertex(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
};

// Check if any point falls outside standard India bounding box (approx 6-38° N, 68-98° E)
const isOutsideIndia = (lat: number, lng: number): boolean => {
  return lat < 6.0 || lat > 38.0 || lng < 68.0 || lng > 98.0;
};

export const FarmBoundaryMap: React.FC<FarmBoundaryMapProps> = ({
  farmId,
  farmName,
  initialBoundary,
  onBoundaryUpdated,
}) => {
  const [boundary, setBoundary] = useState<FarmBoundary | null>(initialBoundary);
  const [isDrawing, setIsDrawing] = useState(false);
  const [vertices, setVertices] = useState<[number, number][]>([]); // [lat, lng]
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [indiaAdvisory, setIndiaAdvisory] = useState<string | null>(null);

  useEffect(() => {
    setBoundary(initialBoundary);
  }, [initialBoundary]);

  // Convert GeoJSON coordinates [[lon, lat], ...] to Leaflet latLngs [[lat, lon], ...]
  const existingPolygonLatLngs = useMemo<[number, number][]>(() => {
    if (!boundary || !boundary.boundary || !boundary.boundary.coordinates?.[0]) {
      return [];
    }
    // GeoJSON is [lon, lat], Leaflet is [lat, lon]
    return boundary.boundary.coordinates[0].map(([lon, lat]) => [lat, lon]);
  }, [boundary]);

  // Default fallback center: Pune, Maharashtra (18.5204, 73.8567)
  const defaultCenter: [number, number] = useMemo(() => {
    if (boundary?.centroidLatitude && boundary?.centroidLongitude) {
      return [boundary.centroidLatitude, boundary.centroidLongitude];
    }
    return [18.5204, 73.8567];
  }, [boundary]);

  // Start drawing / editing mode
  const handleStartEditing = () => {
    setMapError(null);
    setIndiaAdvisory(null);
    if (existingPolygonLatLngs.length > 0) {
      // Omit closing duplicate vertex when entering vertex edit mode
      const raw = [...existingPolygonLatLngs];
      if (raw.length > 1 && raw[0][0] === raw[raw.length - 1][0] && raw[0][1] === raw[raw.length - 1][1]) {
        raw.pop();
      }
      setVertices(raw);
    } else {
      setVertices([]);
    }
    setIsDrawing(true);
  };

  // Add vertex on map click
  const handleAddVertex = (lat: number, lng: number) => {
    setMapError(null);
    // Keep 6 decimal places
    const cleanLat = Number(lat.toFixed(6));
    const cleanLng = Number(lng.toFixed(6));

    const updated = [...vertices, [cleanLat, cleanLng] as [number, number]];
    setVertices(updated);

    // Advisory check
    const hasOutsidePoint = updated.some(([vLat, vLng]) => isOutsideIndia(vLat, vLng));
    if (hasOutsidePoint) {
      setIndiaAdvisory(
        'Advisory: One or more points fall outside standard Indian territory. Global WGS84 coordinates are supported and will be saved.'
      );
    } else {
      setIndiaAdvisory(null);
    }
  };

  // Undo last placed vertex
  const handleUndoVertex = () => {
    if (vertices.length === 0) return;
    const updated = vertices.slice(0, -1);
    setVertices(updated);
    const hasOutsidePoint = updated.some(([vLat, vLng]) => isOutsideIndia(vLat, vLng));
    if (!hasOutsidePoint) setIndiaAdvisory(null);
  };

  // Clear all vertices
  const handleClearVertices = () => {
    setVertices([]);
    setIndiaAdvisory(null);
    setMapError(null);
  };

  // Cancel editing
  const handleCancel = () => {
    setIsDrawing(false);
    setVertices([]);
    setMapError(null);
    setIndiaAdvisory(null);
  };

  // Save boundary (POST if new, PATCH if update)
  const handleSave = async () => {
    if (vertices.length < 3) {
      setMapError('A polygon boundary requires at least 3 distinct vertices.');
      return;
    }

    try {
      setSaving(true);
      setMapError(null);

      // Convert [lat, lon] to GeoJSON [lon, lat] and close the linear ring
      const ring: [number, number][] = vertices.map(([lat, lon]) => [lon, lat]);
      // Append first coordinate to close ring if not closed
      const first = ring[0];
      const last = ring[ring.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        ring.push([first[0], first[1]]);
      }

      const geoJsonPayload: GeoJSONPolygon = {
        type: 'Polygon',
        coordinates: [ring],
      };

      let result: FarmBoundary;
      if (boundary) {
        const res = await farmBoundaryService.updateBoundary(farmId, geoJsonPayload);
        result = res.data;
      } else {
        const res = await farmBoundaryService.createBoundary(farmId, geoJsonPayload);
        result = res.data;
      }

      setBoundary(result);
      setIsDrawing(false);
      setVertices([]);
      onBoundaryUpdated(result);
    } catch (err: any) {
      const msg =
        err.response?.data?.message ||
        err.message ||
        'Failed to save farm boundary. Ensure geometry does not self-intersect.';
      setMapError(msg);
    } finally {
      setSaving(false);
    }
  };

  // Delete boundary
  const handleDelete = async () => {
    try {
      setDeleting(true);
      setMapError(null);
      await farmBoundaryService.deleteBoundary(farmId);
      setBoundary(null);
      setShowDeleteConfirm(false);
      onBoundaryUpdated(null);
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Failed to delete farm boundary';
      setMapError(msg);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden space-y-0">
      {/* Map Header Bar */}
      <div className="p-5 sm:p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                isDrawing
                  ? 'bg-amber-100 text-amber-800 border-amber-200'
                  : boundary
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                  : 'bg-slate-100 text-slate-700 border-slate-200'
              }`}
            >
              {isDrawing ? 'EDIT / DRAW MODE' : boundary ? 'ACTIVE SPATIAL BOUNDARY' : 'UNMAPPED'}
            </span>
            <span className="text-xs text-slate-400">EPSG:4326 (WGS84)</span>
          </div>
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Layers className="w-5 h-5 text-emerald-600" />
            <span>Farm Geospatial Boundary</span>
          </h3>
          <p className="text-xs text-slate-500">
            Authoritative polygon boundary used for parametric weather indices and satellite remote sensing.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center flex-wrap gap-2">
          {!isDrawing ? (
            <>
              <button
                type="button"
                onClick={handleStartEditing}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>{boundary ? 'Edit Boundary' : 'Draw Boundary'}</span>
              </button>

              {boundary && (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-rose-200 hover:bg-rose-50 text-rose-700 text-xs font-semibold shadow-sm transition"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                  <span>Delete</span>
                </button>
              )}
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleUndoVertex}
                disabled={vertices.length === 0 || saving}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 text-xs font-medium hover:bg-slate-50 disabled:opacity-40"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Undo Point</span>
              </button>
              <button
                type="button"
                onClick={handleClearVertices}
                disabled={vertices.length === 0 || saving}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 text-xs font-medium hover:bg-slate-50 disabled:opacity-40"
              >
                <X className="w-3.5 h-3.5" />
                <span>Clear</span>
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={saving}
                className="px-3.5 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={vertices.length < 3 || saving}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm disabled:opacity-50"
              >
                {saving ? (
                  <LoadingSpinner size="sm" className="text-white" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                <span>{saving ? 'Saving...' : 'Save Boundary'}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Dynamic Alerts Banner */}
      {mapError && (
        <div className="p-3.5 bg-rose-50 border-b border-rose-100 text-rose-800 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
          <span className="font-medium">{mapError}</span>
        </div>
      )}

      {indiaAdvisory && (
        <div className="p-3 bg-amber-50 border-b border-amber-100 text-amber-800 text-xs flex items-center gap-2">
          <Info className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <span>{indiaAdvisory}</span>
        </div>
      )}

      {/* Draw Mode Guidance Bar */}
      {isDrawing && (
        <div className="px-5 py-2.5 bg-blue-50/80 border-b border-blue-100 text-xs text-blue-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Navigation className="w-4 h-4 text-blue-600" />
            <span>Click anywhere on the map to place polygon perimeter vertices.</span>
          </div>
          <div className="font-bold text-blue-900 font-mono">
            {vertices.length} {vertices.length === 1 ? 'vertex' : 'vertices'} placed{' '}
            {vertices.length >= 3 ? '(valid polygon)' : '(minimum 3 required)'}
          </div>
        </div>
      )}

      {/* Leaflet Map Canvas */}
      <div className="relative h-[440px] w-full bg-slate-100">
        <MapContainer
          center={defaultCenter}
          zoom={boundary ? 16 : 7}
          scrollWheelZoom={true}
          className="h-full w-full z-0"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <MapViewController
            center={defaultCenter}
            zoom={boundary ? 16 : 7}
            bounds={
              isDrawing && vertices.length > 2
                ? vertices
                : existingPolygonLatLngs.length > 2
                ? existingPolygonLatLngs
                : undefined
            }
          />

          <MapDrawingListener isDrawing={isDrawing} onAddVertex={handleAddVertex} />

          {/* VIEW MODE: Render Authoritative Boundary */}
          {!isDrawing && boundary && existingPolygonLatLngs.length > 0 && (
            <>
              <LeafletPolygon
                positions={existingPolygonLatLngs}
                pathOptions={{
                  color: '#059669', // Emerald 600
                  fillColor: '#10b981', // Emerald 500
                  fillOpacity: 0.35,
                  weight: 3,
                }}
              >
                <Popup>
                  <div className="space-y-1 p-1">
                    <div className="font-bold text-xs text-slate-800">{farmName}</div>
                    <div className="text-[11px] text-slate-600">
                      Calculated Area: <b>{boundary.calculatedAreaSqM.toLocaleString()} m²</b>
                    </div>
                    <div className="text-[11px] text-slate-600">
                      Hectares: <b>{boundary.calculatedAreaHectares} ha</b>
                    </div>
                    <div className="text-[11px] text-slate-600">
                      Acres: <b>{boundary.calculatedAreaAcres} acres</b>
                    </div>
                  </div>
                </Popup>
              </LeafletPolygon>

              {/* Centroid Marker */}
              {boundary.centroidLatitude && boundary.centroidLongitude && (
                <Marker
                  position={[boundary.centroidLatitude, boundary.centroidLongitude]}
                  icon={centroidIcon}
                >
                  <Popup>
                    <div className="space-y-1 p-1 text-xs">
                      <div className="font-bold text-emerald-800">Centroid / Weather Grid Point</div>
                      <div>Latitude: {boundary.centroidLatitude}° N</div>
                      <div>Longitude: {boundary.centroidLongitude}° E</div>
                    </div>
                  </Popup>
                </Marker>
              )}
            </>
          )}

          {/* DRAW / EDIT MODE: Render In-Progress Polygon / Lines & Vertex Markers */}
          {isDrawing && (
            <>
              {vertices.length >= 3 && (
                <LeafletPolygon
                  positions={vertices}
                  pathOptions={{
                    color: '#2563eb', // Blue 600
                    fillColor: '#3b82f6', // Blue 500
                    fillOpacity: 0.3,
                    weight: 2,
                    dashArray: '4, 4',
                  }}
                />
              )}

              {vertices.length === 2 && (
                <Polyline
                  positions={vertices}
                  pathOptions={{
                    color: '#2563eb',
                    weight: 2,
                    dashArray: '4, 4',
                  }}
                />
              )}

              {vertices.map((pt, idx) => (
                <Marker key={`vertex-${idx}`} position={pt} icon={vertexIcon(idx)}>
                  <Popup>
                    <div className="text-xs">
                      Vertex #{idx + 1}: [{pt[0]}, {pt[1]}]
                    </div>
                  </Popup>
                </Marker>
              ))}
            </>
          )}
        </MapContainer>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center space-x-3 text-rose-600">
              <Trash2 className="w-6 h-6 flex-shrink-0" />
              <h3 className="text-lg font-bold text-slate-900">Delete Farm Boundary?</h3>
            </div>

            <p className="text-sm text-slate-600 leading-relaxed">
              Are you sure you want to remove the geospatial boundary for{' '}
              <span className="font-semibold">{farmName}</span>? The farm record itself will remain
              intact.
            </p>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-sm"
              >
                {deleting && <LoadingSpinner size="sm" className="text-white" />}
                {deleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

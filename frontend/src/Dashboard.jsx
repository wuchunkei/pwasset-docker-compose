import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import AssetList from './AssetList'; // Import the new component

// Use relative path and dev proxy to avoid localhost issues for clients
const API_BASE_URL = '';

const Dashboard = ({ user, onLogout }) => {
  const [areas, setAreas] = useState([]);
  const [parks, setParks] = useState([]);
  const [selectedArea, setSelectedArea] = useState(null);
  const [selectedParkIds, setSelectedParkIds] = useState(new Set()); // Renamed for clarity

  // 1. Restore Data Fetching
  useEffect(() => {
    const fetchData = async () => {
      const token = localStorage.getItem('token');
      try {
        const [areasResponse, parksResponse] = await Promise.all([
          axios.get(`${API_BASE_URL}/api/areas`, { headers: { Authorization: `Bearer ${token}` } }),
          axios.get(`${API_BASE_URL}/api/parks`, { headers: { Authorization: `Bearer ${token}` } })
        ]);
        setAreas(areasResponse.data);
        setParks(parksResponse.data);
      } catch (error) {
        console.error('Failed to fetch data', error);
      }
    };
    fetchData();
  }, []);

  // 2. Restore User-Specific Data Filtering
  const userParks = useMemo(() => parks.filter(park => user.parkIds.includes(park.parkId)), [parks, user.parkIds]);
  const availableAreaCodes = useMemo(() => [...new Set(userParks.map(park => park.areaCode))], [userParks]);
  const availableAreas = useMemo(() => areas.filter(area => availableAreaCodes.includes(area.code)), [areas, availableAreaCodes]);

  // 3. Set initial selection to ALL parks
  useEffect(() => {
    if (userParks.length > 0) {
      setSelectedParkIds(new Set(userParks.map(p => p.parkId)));
      setSelectedArea(null); // Default to top-level 'All'
    }
  }, [userParks]);

  // 4. Update Event Handlers with new logic
  const handleAreaChange = (area) => {
    setSelectedArea(area);
    const parksToSelect = area
      ? userParks.filter(p => p.areaCode === area.code)
      : userParks;
    setSelectedParkIds(new Set(parksToSelect.map(p => p.parkId)));
  };

  const handleParkClick = (parkId) => {
    setSelectedParkIds(new Set([parkId]));
  };

  const handleSelectAllInArea = () => {
    if (selectedArea) {
      const parksInArea = userParks.filter(p => p.areaCode === selectedArea.code);
      setSelectedParkIds(new Set(parksInArea.map(p => p.parkId)));
    }
  };

  const isAllInAreaSelected = () => {
    if (!selectedArea) return false;
    const parksInArea = userParks.filter(p => p.areaCode === selectedArea.code);
    return parksInArea.length > 0 && parksInArea.every(p => selectedParkIds.has(p.parkId));
  };

  const filteredParks = selectedArea
    ? userParks.filter(park => park.areaCode === selectedArea.code)
    : userParks;

  // Derive selected park objects for AssetList
  const selectedParks = useMemo(() => 
    parks.filter(p => selectedParkIds.has(p.parkId)),
    [parks, selectedParkIds]
  );

  // Persist selected park ids to sessionStorage for SearchResults page
  useEffect(() => {
    try {
      const csv = Array.from(selectedParkIds).join(',');
      sessionStorage.setItem('selectedParkIds', csv);
    } catch (e) {
      // ignore storage errors
    }
  }, [selectedParkIds]);

  return (
    <div className="app-layout"> {/* Apply the new layout */}
      <div className="dashboard-container">
        <div className="dashboard-header">
          <h1>Park</h1>
          <button onClick={onLogout} className="logout-button">Log Out</button>
        </div>

        <div className="area-selector">
          <button onClick={() => handleAreaChange(null)} className={!selectedArea ? 'active' : ''}>
            All
          </button>
          {availableAreas.map(area => (
            <button
              key={area.areaId}
              onClick={() => handleAreaChange(area)}
              className={selectedArea?.areaId === area.areaId ? 'active' : ''}
            >
              {area.areaId}
            </button>
          ))}
        </div>

        <div className="park-grid">
          {selectedArea && (
              <button
                  className={`park-button ${isAllInAreaSelected() ? "selected" : ""}`}
                  onClick={handleSelectAllInArea}
              >
                  All
              </button>
          )}
          {filteredParks.map((park) => (
            <button
              key={park.parkId}
              className={`park-button ${selectedParkIds.has(park.parkId) ? 'selected' : ''}`}
              onClick={() => handleParkClick(park.parkId)}
            >
              {park.name}
            </button>
          ))}
        </div>
      </div>
      <div className="asset-container"> {/* Container for the asset list */}
        <AssetList selectedParks={selectedParks} />
      </div>
    </div>
  );
};

export default Dashboard;
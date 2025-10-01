import React, { useEffect, useState, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';

// Use relative path and dev proxy to avoid localhost issues for clients
const API_BASE_URL = '';

const useQueryParam = () => {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
};

const formatDate = (dateString) => {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-CA');
};

const formatDateIfDate = (value) => {
  if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}T/)) {
    return formatDate(value);
  }
  return value || 'N/A';
};

const filterDataByQuery = (rows, q) => {
  if (!q) return rows;
  const lower = q.toLowerCase();
  return rows.filter(row => Object.values(row).some(val => String(val || '').toLowerCase().includes(lower)));
};

const highlightMatch = (text, q) => {
  const s = String(text ?? 'N/A');
  if (!q) return s;
  const lower = s.toLowerCase();
  const idx = lower.indexOf(q.toLowerCase());
  if (idx === -1) return s;
  const before = s.slice(0, idx);
  const match = s.slice(idx, idx + q.length);
  const after = s.slice(idx + q.length);
  return (
    <>
      {before}
      <span className="highlight">{match}</span>
      {after}
    </>
  );
};

const SearchResults = () => {
  const params = useQueryParam();
  const navigate = useNavigate();
  const initialQ = params.get('q') || '';
  const [query, setQuery] = useState(initialQ);
  const [dataSets, setDataSets] = useState({ assets: [], transfers: [], disposals: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      setError(null);
      try {
        const token = localStorage.getItem('token');
        const selectedIdsCSV = sessionStorage.getItem('selectedParkIds');
        const locations = selectedIdsCSV || '';
        const headers = { Authorization: `Bearer ${token}` };
        const [assetsRes, transfersRes, disposalsRes] = await Promise.all([
          axios.get(`${API_BASE_URL}/api/assets`, { headers, params: { locations } }),
          axios.get(`${API_BASE_URL}/api/transfers`, { headers, params: { locations } }),
          axios.get(`${API_BASE_URL}/api/disposals`, { headers, params: { locations } })
        ]);
        setDataSets({
          assets: assetsRes.data || [],
          transfers: transfersRes.data || [],
          disposals: disposalsRes.data || []
        });
      } catch (err) {
        console.error(err);
        setError('Failed to fetch search data.');
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  const combinedRows = useMemo(() => {
    const tagKey = (obj) => obj['Tag'] ?? obj['tag'];
    const mapWithType = (rows, type) => rows.map(r => ({ ...r, __type: type, __isDisposal: (type === 'Disposal') || String(tagKey(r) || '').toLowerCase() === 'disposal' }));
    return [
      ...mapWithType(dataSets.assets, 'Asset'),
      ...mapWithType(dataSets.transfers, 'Transfer'),
      ...mapWithType(dataSets.disposals, 'Disposal')
    ];
  }, [dataSets]);

  const rows = filterDataByQuery(combinedRows, query);

  // Fixed headers for assets; dynamic otherwise, plus Type column
  const assetHeaders = ['Location', 'Old Asset Code', 'New Asset Code', 'SN', 'Details', 'Tag', 'operator'];
  const headers = rows.length > 0
    ? ['Type', ...(rows[0]['Location'] && rows[0]['Details'] ? assetHeaders : Object.keys(rows[0]).filter(k => !k.startsWith('__')))]
    : ['Type'];

  const handleSearch = () => {
    navigate(`/search?q=${encodeURIComponent(query)}`);
  };

  return (
    <div className="asset-list-container">
      <div className="asset-toolbar">
        <div className="asset-tabs">
          <button className="tab-button" onClick={() => navigate('/dashboard')}>Back to Dashboard</button>
        </div>
        <div className="search-box">
          <input
            className="search-input"
            type="text"
            placeholder="Search…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
          />
          <button type="button" className="search-button" onClick={handleSearch}>Search</button>
        </div>
      </div>

      {loading && <p>Loading...</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {!loading && !error && (
        <table>
          <thead>
            <tr>
              {headers.map(h => <th key={h}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx} className={row.__isDisposal ? 'disposal-row' : ''}>
                {headers.map((header) => {
                  let value;
                  if (header === 'Type') {
                    value = row.__type;
                  } else if (header.toLowerCase() === 'operator') {
                    value = row['Operator'] ?? row['operator'];
                  } else {
                    value = row[header];
                  }
                  const cellValue = formatDateIfDate(value);
                  return (
                    <td key={header}>
                      {highlightMatch(cellValue, query)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default SearchResults;
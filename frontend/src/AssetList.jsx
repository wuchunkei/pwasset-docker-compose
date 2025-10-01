import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';

// Use relative path and dev proxy to avoid localhost issues for clients
const API_BASE_URL = '';

const AssetList = ({ selectedParks }) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('details'); // 'details', 'transfer', 'disposal'
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // search & scan UI states
  const [query, setQuery] = useState('');
  const [scanEnabled, setScanEnabled] = useState(false);
  const [scanFilterId, setScanFilterId] = useState('');
  const [lastInputAt, setLastInputAt] = useState(0);
  const isObjectId = (s) => /^[0-9a-fA-F]{24}$/.test(String(s || '').trim());
  const handleSearch = () => {
    if (scanEnabled) {
      const id = String(query || '').trim();
      setScanFilterId(id);
    } else {
      navigate(`/search?q=${encodeURIComponent(query)}`);
    }
  };

  // add-item modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ location: '', oldCode: '', sn: '', details: '' });
  const [addError, setAddError] = useState('');
  const [addSuccess, setAddSuccess] = useState(false);
  // transfer add modal states
  const [transferForm, setTransferForm] = useState({ oldCode: '', by: '', to: '', reason: 'Operation', whenDate: '' });
  const [transferError, setTransferError] = useState('');
  const [transferSuccess, setTransferSuccess] = useState(false);
  // disposal add modal states
  const [disposalForm, setDisposalForm] = useState({ location: '', oldCode: '', sn: '', details: '', reasonBase: 'Scrapped', vendor: '', whenDate: '' });
  const [disposalError, setDisposalError] = useState('');
  const [disposalSuccess, setDisposalSuccess] = useState(false);
  // highlight target for disposal tab via URL
  const routerLocation = useLocation();
  const [highlightOldCode, setHighlightOldCode] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      if (!selectedParks || selectedParks.length === 0) {
        setData([]);
        return;
      }

      setLoading(true);
      setError(null);

      let endpoint = '';
      if (activeTab === 'details') {
        endpoint = '/api/assets';
      } else if (activeTab === 'transfer') {
        endpoint = '/api/transfers';
      } else if (activeTab === 'disposal') {
        endpoint = '/api/disposals';
      }

      try {
        const token = localStorage.getItem('token');
        const locations = selectedParks.map(p => p.parkId).join(',');
        const response = await axios.get(`${API_BASE_URL}${endpoint}`,
         {
          headers: { Authorization: `Bearer ${token}` },
          params: { locations }
        });
        setData(response.data);
      } catch (err) {
        setError(`Failed to fetch ${activeTab} data.`);
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [selectedParks, activeTab]);

  // removed dropdown suggestions per request

  // default location from first selected park when opening details tab
  useEffect(() => {
    if (activeTab === 'details' && selectedParks && selectedParks.length > 0 && !addForm.location) {
      setAddForm(f => ({ ...f, location: selectedParks[0].parkId }));
    }
  }, [selectedParks, activeTab]);

  // default target and date for transfer tab
  useEffect(() => {
    if (activeTab === 'transfer') {
      const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
      setTransferForm(f => ({
        ...f,
        whenDate: f.whenDate || today,
        to: f.to || (selectedParks && selectedParks[0]?.parkId) || ''
      }));
    }
  }, [selectedParks, activeTab]);

  // default location and date for disposal tab
  useEffect(() => {
    if (activeTab === 'disposal') {
      const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
      setDisposalForm(f => ({
        ...f,
        whenDate: f.whenDate || today,
        location: f.location || (selectedParks && selectedParks[0]?.parkId) || ''
      }));
    }
  }, [selectedParks, activeTab]);

  // read URL params to set tab and highlight target
  useEffect(() => {
    try {
      const params = new URLSearchParams(routerLocation.search);
      const tab = params.get('tab');
      const hlOld = params.get('highlightOld');
      if (tab === 'disposal') {
        setActiveTab('disposal');
        setHighlightOldCode(hlOld || '');
      } else {
        setHighlightOldCode('');
      }
    } catch (e) {
      // ignore URL parse errors
    }
  }, [routerLocation.search]);

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

  // Inline edit/delete states and handlers
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({});
  const [confirmStep, setConfirmStep] = useState(null); // 'edit' | 'delete'

  const startEdit = (row, headers) => {
    if (editingId && editingId !== row._id) {
      // 如果正在二次確認，允許編輯其他行，默認取消當前行
      cancelEditOrDelete();
    }
    setEditingId(row._id);
    const editable = {};
    headers.forEach(h => {
      if (h !== 'Tag' && h.toLowerCase() !== 'operator' && h !== 'Actions') {
        editable[h] = row[h];
      }
    });
    setEditDraft(editable);
    setConfirmStep(null);
  };
  const cancelEditOrDelete = () => { setEditingId(null); setEditDraft({}); setConfirmStep(null); };
  const changeDraft = (key, val) => setEditDraft(d => ({ ...d, [key]: val }));

  const firstConfirmEdit = () => setConfirmStep('edit');
  const finalConfirmEdit = async () => {
    try {
      const token = localStorage.getItem('token');
      const url = activeTab === 'disposal' ? `${API_BASE_URL}/api/disposals/update` : (activeTab === 'transfer' ? `${API_BASE_URL}/api/transfers/update` : `${API_BASE_URL}/api/assets/update`);
      await axios.post(url, { id: editingId, After: editDraft }, { headers: { Authorization: `Bearer ${token}` } });
      // refetch
      const locations = selectedParks.map(p => p.parkId).join(',');
      const endpoint = activeTab === 'disposal' ? '/api/disposals' : (activeTab === 'transfer' ? '/api/transfers' : '/api/assets');
      const response = await axios.get(`${API_BASE_URL}${endpoint}`, { headers: { Authorization: `Bearer ${token}` }, params: { locations } });
      setData(response.data);
      cancelEditOrDelete();
    } catch (e) {
      alert('Update failed: ' + (e?.response?.data?.message || e.message));
    }
  };
  const firstConfirmDelete = (row) => {
    if (editingId && editingId !== row._id) {
      cancelEditOrDelete();
    }
    setEditingId(row._id);
    setConfirmStep('delete');
  };
  const finalConfirmDelete = async () => {
    try {
      const token = localStorage.getItem('token');
      const url = activeTab === 'disposal' ? `${API_BASE_URL}/api/disposals/delete` : (activeTab === 'transfer' ? `${API_BASE_URL}/api/transfers/delete` : `${API_BASE_URL}/api/assets/delete`);
      await axios.post(url, { id: editingId }, { headers: { Authorization: `Bearer ${token}` } });
      const locations = selectedParks.map(p => p.parkId).join(',');
      const endpoint = activeTab === 'disposal' ? '/api/disposals' : (activeTab === 'transfer' ? '/api/transfers' : '/api/assets');
      const response = await axios.get(`${API_BASE_URL}${endpoint}`, { headers: { Authorization: `Bearer ${token}` }, params: { locations } });
      setData(response.data);
      cancelEditOrDelete();
    } catch (e) {
      alert('Delete failed: ' + (e?.response?.data?.message || e.message));
    }
  };

  const renderTable = () => {
    if (loading) return <p>Loading...</p>;
    if (error) return <p style={{ color: 'red' }}>{error}</p>;
    if (data.length === 0) return <p>No data found.</p>;

    let rows = data;
    if (scanEnabled) {
      rows = scanFilterId ? data.filter(r => String(r._id) === String(scanFilterId)) : data;
    } else {
      rows = filterDataByQuery(data, query);
    }

    // Use fixed column order for Asset Details and Disposal tabs per requirement
    let headers = [];
    if (activeTab === 'details') {
      headers = [
        'Location',
        'Old Asset Code',
        'SN',
        'Details',
        'Tag',
        'operator',
        'Actions'
      ];
    } else if (activeTab === 'transfer') {
      headers = [
        'Old Asset Code',
        'By',
        'To',
        'Reason',
        'When',
        'operator',
        'Actions'
      ];
    } else if (activeTab === 'disposal') {
      headers = [
        'Location',
        'Old Asset Code',
        'SN',
        'Details',
        'When',
        'operator',
        'Reason',
        'Actions'
      ];
    } else {
      headers = rows.length > 0 ? Object.keys(rows[0]) : [];
    }

    return (
      <table>
        <thead>
          <tr>
            {headers.map(header => <th key={header}>{header}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const tagValue = row['Tag'] ?? row['tag'];
            const isTargetHighlight = activeTab === 'disposal' && highlightOldCode && (row['Old Asset Code'] === highlightOldCode);
            const isRowDisposal = (activeTab !== 'disposal') && (tagValue && String(tagValue).toLowerCase() === 'disposal');
            return (
            <tr key={index} className={(isRowDisposal || isTargetHighlight) ? 'disposal-row' : ''}>
              {headers.map(header => {
                let value;
                if (header.toLowerCase() === 'operator') {
                  value = row['Operator'] ?? row['operator'];
                } else {
                  value = row[header];
                }
                const cellValue = formatDateIfDate(value);
                const isDisposalTag = header === 'Tag' && typeof value !== 'undefined' && String(value).toLowerCase() === 'disposal';
                if (header === 'Tag' && isDisposalTag) {
                  const oldCodeForJump = row['Old Asset Code'] || '';
                  return (
                    <td key={header} style={{ color: 'red', fontWeight: 600 }}>
                      <button className="link-button" onClick={() => { cancelEditOrDelete(); navigate(`/dashboard?tab=disposal&highlightOld=${encodeURIComponent(oldCodeForJump)}`); }}>
                        disposal
                      </button>
                    </td>
                  );
                }
                if (header === 'Actions') {
                  const isEditingRow = editingId === row._id;
                  // Keep other rows' action buttons visible even during second confirmation
                  if (!isEditingRow) {
                    return (
                      <td key={header}>
                        <button className="icon-btn" title="Edit" onClick={() => startEdit(row, headers)}><i className="el-icon-edit-outline"></i></button>
                        <button className="icon-btn" title="Delete" onClick={() => firstConfirmDelete(row)}><i className="el-icon-delete"></i></button>
                      </td>
                    );
                  }
                  if (isEditingRow && !confirmStep) {
                    return (
                      <td key={header}>
                        <button className="icon-btn confirm" title="Confirm" onClick={firstConfirmEdit}><i className="el-icon-check"></i></button>
                        <button className="icon-btn cancel" title="Cancel" onClick={cancelEditOrDelete}><i className="el-icon-close"></i></button>
                      </td>
                    );
                  }
                  if (confirmStep === 'edit' && isEditingRow) {
                    return (
                      <td key={header}>
                        <button className="icon-btn confirm" title="Confirm Again" onClick={finalConfirmEdit}><i className="el-icon-circle-check"></i></button>
                        <button className="icon-btn cancel" title="Cancel" onClick={cancelEditOrDelete}><i className="el-icon-circle-close"></i></button>
                      </td>
                    );
                  }
                  if (confirmStep === 'delete' && isEditingRow) {
                    return (
                      <td key={header}>
                        <button className="icon-btn confirm" title="Confirm Delete" onClick={finalConfirmDelete}><i className="el-icon-circle-check"></i></button>
                        <button className="icon-btn cancel" title="Cancel" onClick={cancelEditOrDelete}><i className="el-icon-circle-close"></i></button>
                      </td>
                    );
                  }
                }
                const isEditingRow = editingId === row._id;
                const isEditable = isEditingRow && header !== 'Tag' && header.toLowerCase() !== 'operator' && header !== 'Actions';
                if (isEditable) {
                  const val = editDraft[header] ?? '';
                  const inputType = header === 'When' ? 'date' : 'text';
                  const toDateVal = (hdr, v) => {
                    if (hdr === 'When') { try { return (v || '').slice(0, 10); } catch { return ''; } }
                    return v || '';
                  };
                  if (header === 'Location') {
                    return (
                      <td key={header}>
                        <select className="cell-input" value={val || ''} onChange={(e)=> changeDraft('Location', e.target.value)}>
                          <option value="">Please select</option>
                          {selectedParks?.map(p => (
                            <option key={p.parkId} value={p.parkId}>{p.name}</option>
                          ))}
                        </select>
                      </td>
                    );
                  }
                  return (
                    <td key={header}>
                      <input className="cell-input" type={inputType} value={toDateVal(header, val)} onChange={(e) => changeDraft(header, e.target.value)} />
                    </td>
                  );
                }
                return (
                  <td key={header}>
                    {highlightMatch(cellValue, query)}
                  </td>
                );
              })}
            </tr>
            );
          })}
        </tbody>
      </table>
    );
  };

  const openAddModal = () => {
    setAddError('');
    setAddSuccess(false);
    setTransferError('');
    setTransferSuccess(false);
    setShowAddModal(true);
  };

  const closeAddModal = () => {
    setShowAddModal(false);
    setAddSuccess(false);
    setAddError('');
    setAddForm({ location: '', oldCode: '', sn: '', details: '' });
    setTransferSuccess(false);
    setTransferError('');
    setTransferForm({ oldCode: '', by: '', to: '', reason: 'Operation', whenDate: '' });
  };

  const handleAddChange = (e) => {
    const { name, value } = e.target;
    setAddForm(prev => ({ ...prev, [name]: value }));
  };

  const submitAdd = async () => {
    setAddError('');
    if (!addForm.location) {
      setAddError('Please select Location');
      return;
    }
    if (!addForm.details.trim()) {
      setAddError('Details is required');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const payload = {
        Location: addForm.location,
        'Old Asset Code': addForm.oldCode || undefined,
        SN: addForm.sn || undefined,
        Details: addForm.details.trim()
      };
      const res = await axios.post(`${API_BASE_URL}/api/assets/add`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const item = res.data?.item;
      if (item) {
        // Prepend the new item to current list without refetching
        setData(prev => [item, ...prev]);
      }
      setAddSuccess(true);
    } catch (err) {
      console.error(err);
      setAddError('Failed to add, please try again later');
    }
  };

  const submitAddTransfer = async () => {
    setTransferError('');
    if (!transferForm.oldCode) { setTransferError('Please enter Old Asset Code'); return; }
    if (!transferForm.to) { setTransferError('Please select To'); return; }
    try {
      const token = localStorage.getItem('token');
      const payload = {
        'Old Asset Code': transferForm.oldCode,
        'By': transferForm.by || undefined,
        'To': transferForm.to,
        'Reason': transferForm.reason || 'Operation',
        whenDate: transferForm.whenDate || undefined
      };
      const res = await axios.post(`${API_BASE_URL}/api/transfers/add`, payload, { headers: { Authorization: `Bearer ${token}` } });
      const item = res.data?.item;
      if (item) {
        setData(prev => [item, ...prev]);
      }
      setTransferSuccess(true);
    } catch (err) {
      console.error(err);
      setTransferError('Failed to add, please try again later');
    }
  };

  const submitAddDisposal = async () => {
    setDisposalError('');
    if (!disposalForm.location) { setDisposalError('Please select Location'); return; }
    if (!disposalForm.oldCode) { setDisposalError('Please enter Old Asset Code'); return; }
    if (!disposalForm.reasonBase) { setDisposalError('Please select Reason'); return; }
    if ((disposalForm.reasonBase === 'Sold to Third Party' || disposalForm.reasonBase === 'Trade in') && !disposalForm.vendor.trim()) { setDisposalError('Please enter Vendor'); return; }

    try {
      const token = localStorage.getItem('token');
      const payload = {
        Location: disposalForm.location,
        'Old Asset Code': disposalForm.oldCode,
        SN: disposalForm.sn || undefined,
        Details: disposalForm.details || undefined,
        reasonBase: disposalForm.reasonBase,
        Vendor: disposalForm.vendor || undefined,
        whenDate: disposalForm.whenDate || undefined
      };
      const res = await axios.post(`${API_BASE_URL}/api/disposals/add`, payload, { headers: { Authorization: `Bearer ${token}` } });
      const item = res.data?.item;
      if (item) {
        setData(prev => [item, ...prev]);
      }
      setDisposalSuccess(true);
    } catch (err) {
      console.error(err);
      setDisposalError('Failed to add, please try again later');
    }
  };

  return (
    <div className="asset-list-container">
      <div className="asset-toolbar">
        <div className="asset-tabs">
          <button 
            className={`tab-button ${activeTab === 'details' ? 'active' : ''}`}
            onClick={() => setActiveTab('details')}
          >
            Asset Details
          </button>
          <button 
            className={`tab-button ${activeTab === 'transfer' ? 'active' : ''}`}
            onClick={() => setActiveTab('transfer')}
          >
            Transfer History
          </button>
          <button 
            className={`tab-button ${activeTab === 'disposal' ? 'active' : ''}`}
            onClick={() => setActiveTab('disposal')}
          >
            Disposal History
          </button>
        </div>
        <div className="search-box">
          <input
            className="search-input"
            type="text"
            placeholder={scanEnabled ? 'Please scan Barcode or QR Code.' : 'Old Asset Code, SN, Details...'}
            value={query}
            onChange={(e) => {
              const now = Date.now();
              const val = e.target.value;
              if (scanEnabled) {
                // When starting a new scan string after a pause, clear previous first
                if (now - lastInputAt > 700) {
                  const lastChar = val.slice(-1);
                  setQuery(lastChar);
                } else {
                  setQuery(val);
                }
                setLastInputAt(now);
                const trimmed = String(val).trim();
                if (isObjectId(trimmed)) {
                  setScanFilterId(trimmed);
                }
              } else {
                setQuery(val);
              }
            }}
            onKeyDown={(e) => { if (e.key === 'Enter') { handleSearch(); } }}
          />
          <button type="button" className="search-button" onClick={handleSearch}>Search</button>
          <button
            type="button"
            className={`camera-toggle-btn ${scanEnabled ? 'active' : ''}`}
            aria-label="Scan"
            title={scanEnabled ? 'Scanning enabled' : 'Enable scanning'}
            onClick={() => {
              const next = !scanEnabled;
              setScanEnabled(next);
              if (!next) { setScanFilterId(''); }
            }}
          >
            <i className={scanEnabled ? 'el-icon-camera-solid' : 'el-icon-camera'}></i>
          </button>
          {(activeTab === 'details' || activeTab === 'transfer' || activeTab === 'disposal') && (
            <button type="button" className="add-icon-btn" aria-label="Add" onClick={openAddModal}><i className="el-icon-plus"></i></button>
          )}
        </div>
      </div>
      
      {renderTable()}

      {showAddModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">{activeTab === 'details' ? 'Add Asset' : (activeTab === 'transfer' ? 'Add Transfer' : 'Add Disposal')}</div>
            <div className="modal-body">
              {activeTab === 'details' ? (
                <>
                  {addError && <div className="error-message" style={{ marginBottom: '0.5rem' }}>{addError}</div>}
                  {!addSuccess ? (
                    <>
                      <div className="form-row">
                        <label>Location</label>
                        <select name="location" value={addForm.location} onChange={handleAddChange}>
                          <option value="">Please select</option>
                          {selectedParks?.map(p => (
                            <option key={p.parkId} value={p.parkId}>{p.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="form-row">
                        <label>Old Asset Code</label>
                        <input name="oldCode" type="text" value={addForm.oldCode} onChange={handleAddChange} />
                      </div>
                      <div className="form-row">
                        <label>SN</label>
                        <input name="sn" type="text" value={addForm.sn} onChange={handleAddChange} />
                      </div>
                      <div className="form-row">
                        <label>Details<span style={{ color: 'red' }}>*</span></label>
                        <input name="details" type="text" value={addForm.details} onChange={handleAddChange} />
                      </div>
                    </>
                  ) : (
                    <div style={{ marginBottom: '0.5rem' }}>Added successfully. Continue adding?</div>
                  )}
                </>
              ) : activeTab === 'transfer' ? (
                <>
                  {transferError && <div className="error-message" style={{ marginBottom: '0.5rem' }}>{transferError}</div>}
                  {!transferSuccess ? (
                    <>
                      <div className="form-row">
                        <label>Old Asset Code<span style={{ color: 'red' }}>*</span></label>
                        <input name="oldCode" type="text" value={transferForm.oldCode} onChange={(e)=> setTransferForm(f => ({...f, oldCode: e.target.value}))} />
                      </div>
                      <div className="form-row">
                        <label>By</label>
                        <input name="by" type="text" value={transferForm.by} onChange={(e)=> setTransferForm(f => ({...f, by: e.target.value}))} />
                      </div>
                      <div className="form-row">
                        <label>To<span style={{ color: 'red' }}>*</span></label>
                        <select name="to" value={transferForm.to} onChange={(e)=> setTransferForm(f => ({...f, to: e.target.value}))}>
                          <option value="">Please select</option>
                          {selectedParks?.map(p => (
                            <option key={p.parkId} value={p.parkId}>{p.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="form-row">
                        <label>Reason</label>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          {['Operation','Repair'].map(r => (
                            <button type="button" key={r} className={`tab-button ${transferForm.reason === r ? 'active' : ''}`} onClick={()=> setTransferForm(f => ({...f, reason: r}))}>{r}</button>
                          ))}
                        </div>
                      </div>
                      <div className="form-row">
                        <label>When</label>
                        <input name="whenDate" type="date" value={transferForm.whenDate} onChange={(e)=> setTransferForm(f => ({...f, whenDate: e.target.value}))} />
                      </div>
                    </>
                  ) : (
                    <div style={{ marginBottom: '0.5rem' }}>Added successfully. Continue adding?</div>
                  )}
                </>
              ) : (
                <>
                  {disposalError && <div className="error-message" style={{ marginBottom: '0.5rem' }}>{disposalError}</div>}
                  {!disposalSuccess ? (
                    <>
                      <div className="form-row">
                        <label>Location</label>
                        <select name="location" value={disposalForm.location} onChange={(e)=> setDisposalForm(f => ({...f, location: e.target.value}))}>
                          <option value="">Please select</option>
                          {selectedParks?.map(p => (
                            <option key={p.parkId} value={p.parkId}>{p.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="form-row">
                        <label>Old Asset Code</label>
                        <input name="oldCode" type="text" value={disposalForm.oldCode} onChange={(e)=> setDisposalForm(f => ({...f, oldCode: e.target.value}))} />
                      </div>
                      <div className="form-row">
                        <label>SN</label>
                        <input name="sn" type="text" value={disposalForm.sn} onChange={(e)=> setDisposalForm(f => ({...f, sn: e.target.value}))} />
                      </div>
                      <div className="form-row">
                        <label>Details</label>
                        <input name="details" type="text" value={disposalForm.details} onChange={(e)=> setDisposalForm(f => ({...f, details: e.target.value}))} />
                      </div>
                      <div className="form-row">
                        <label>Reason</label>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          {['Scrapped','Sold to Third Party','Trade in'].map(r => (
                            <button type="button" key={r} className={`tab-button ${disposalForm.reasonBase === r ? 'active' : ''}`} onClick={()=> setDisposalForm(f => ({...f, reasonBase: r}))}>{r}</button>
                          ))}
                        </div>
                      </div>
                      {(disposalForm.reasonBase === 'Sold to Third Party' || disposalForm.reasonBase === 'Trade in') && (
                        <div className="form-row">
                          <label>Vendor</label>
                          <input name="vendor" type="text" value={disposalForm.vendor} onChange={(e)=> setDisposalForm(f => ({...f, vendor: e.target.value}))} />
                        </div>
                      )}
                      <div className="form-row">
                        <label>When</label>
                        <input name="whenDate" type="date" value={disposalForm.whenDate} onChange={(e)=> setDisposalForm(f => ({...f, whenDate: e.target.value}))} />
                      </div>
                    </>
                  ) : (
                    <div style={{ marginBottom: '0.5rem' }}>Added successfully. Continue adding?</div>
                  )}
                </>
              )}
            </div>
            <div className="modal-actions">
              {activeTab === 'details' ? (
                !addSuccess ? (
                  <>
                    <button className="secondary" onClick={closeAddModal}>Cancel</button>
                    <button className="primary" onClick={submitAdd}>Confirm</button>
                  </>
                ) : (
                  <>
                    <button className="primary" onClick={() => setAddSuccess(false)}>Add More</button>
                    <button className="secondary" onClick={closeAddModal}>Back</button>
                  </>
                )
              ) : activeTab === 'transfer' ? (
                !transferSuccess ? (
                  <>
                    <button className="secondary" onClick={closeAddModal}>Cancel</button>
                    <button className="primary" onClick={submitAddTransfer}>Confirm</button>
                  </>
                ) : (
                  <>
                    <button className="primary" onClick={() => setTransferSuccess(false)}>Add More</button>
                    <button className="secondary" onClick={closeAddModal}>Back</button>
                  </>
                )
              ) : (
                !disposalSuccess ? (
                  <>
                    <button className="secondary" onClick={closeAddModal}>Cancel</button>
                    <button className="primary" onClick={submitAddDisposal}>Confirm</button>
                  </>
                ) : (
                  <>
                    <button className="primary" onClick={() => setDisposalSuccess(false)}>Add More</button>
                    <button className="secondary" onClick={closeAddModal}>Back</button>
                  </>
                )
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssetList;
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Container, Table, Form, Button } from 'react-bootstrap';


const StockSummaryPage = () => {
  const [inventory, setInventory] = useState([]);
  const [viewMode, setViewMode] = useState('batch'); // 'batch' or 'grouped'
  const [reloadToggle, setReloadToggle] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const endpoint =
      viewMode === 'batch'
        ? 'http://localhost:5000/api/stock/summary'
        : 'http://localhost:5000/api/stock/summary-with-audit';

    axios
      .get(endpoint)
      .then((res) => setInventory(res.data))
      .catch((err) => console.error('Error fetching stock summary:', err));
  }, [viewMode, reloadToggle]);

  const filteredInventory = inventory.filter((item) => {
    const search = searchTerm.toLowerCase();

    if (viewMode === 'grouped') {
      return (
        item.description?.toLowerCase().includes(search) ||
        item.hs_codes?.toLowerCase?.().includes(search)
      );
    } else {
      return (
        item.description?.toLowerCase().includes(search) ||
        item.gd_number?.toLowerCase?.().includes(search) ||
        item.stocked_by?.toLowerCase?.().includes(search) ||
        item.unit?.toLowerCase?.().includes(search)
      );
    }
  });

  return (
    <Container className="my-4">
      <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap">
        <h3 className="stock-summary-heading mb-2">
          {viewMode === 'batch'
            ? '📦 Inventory Summary (By GD Batch)'
            : '📊 Grouped Stock Summary (By Description + Unit)'}
        </h3>

        <Form.Select
          value={viewMode}
          onChange={(e) => setViewMode(e.target.value)}
          style={{ width: 250 }}
        >
          <option value="batch">View by GD Batch</option>
          <option value="grouped">Grouped by Item</option>
        </Form.Select>
      </div>

      <Form.Control
        type="text"
        placeholder="Search by Description, HS Code, GD Number, or Stocked By"
        className="mb-3"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />

      <Button
        variant="outline-secondary"
        size="sm"
        className="mb-2"
        onClick={() => setReloadToggle(r => !r)}
      >
        🔄 Refresh Stock
      </Button>

      <Table bordered hover responsive className="stock-summary-table">
        <thead className="table-light">
          {viewMode === 'batch' ? (
            <tr>
              <th>Description</th>
              <th>GD Number</th>
              <th>Quantity Remaining</th>
              <th>Unit</th>
              <th>Cost</th>
              <th>MRP</th>
              <th>Stocked At</th>
              <th>Stocked By</th>
            </tr>
          ) : (
            <tr>
              <th>Description</th>
              <th>Total Quantity</th>
              <th>Unit</th>
              <th>HS Codes</th>
              <th>GDs Count</th>
              <th>Last Updated</th>
            </tr>
          )}
        </thead>
        <tbody>
          {filteredInventory.length === 0 ? (
            <tr>
              <td colSpan={viewMode === 'batch' ? 8 : 6} className="text-center py-4">
                No inventory records available.
              </td>
            </tr>
          ) : (
            filteredInventory.map((item, i) => (
              <React.Fragment key={i}>
                <tr
                  className={
                    (viewMode === 'batch'
                      ? item.quantity_remaining
                      : item.quantity) < 40
                      ? 'low-stock'
                      : ''
                  }
                >
                  {viewMode === 'batch' ? (
                    <>
                      <td>{item.description}</td>
                      <td>{item.gd_number}</td>
                      <td>{item.quantity_remaining}</td>
                      <td>{item.unit}</td>
                      <td>Rs {Number(item.cost).toFixed(2)}</td>
                      <td>Rs {Number(item.mrp).toFixed(2)}</td>
                      <td>{new Date(item.stocked_at).toLocaleString()}</td>
                      <td>{item.stocked_by || 'N/A'}</td>
                    </>
                  ) : (
                    <>
                      <td>{item.description}</td>
                      <td>{item.quantity}</td>
                      <td>{item.unit}</td>
                      <td>{item.hs_codes || '-'}</td>
                      <td>{item.gd_count || '-'}</td>
                      <td>
                        {item.last_updated
                          ? new Date(item.last_updated).toLocaleString()
                          : 'N/A'}
                      </td>
                    </>
                  )}
                </tr>

                {viewMode === 'grouped' && item.audit_log?.length > 0 && (
                  <tr>
                    <td colSpan={6} className="bg-light">
                      <details>
                        <summary className="fw-bold mb-2">📜 GD-wise Stock-In History</summary>
                        <ul className="mb-0 ps-3">
                          {item.audit_log.map((log, idx) => (
                            <li key={idx}>
                              {log.quantity} units from GD #{log.gd_number || 'N/A'}{' '}
                              {log.stocked_by && `(by ${log.stocked_by})`}{' '}
                              {log.timestamp &&
                                `on ${new Date(log.timestamp).toLocaleDateString()}`}
                            </li>
                          ))}
                        </ul>
                      </details>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))
          )}
        </tbody>
      </Table>
    </Container>
  );
};

export default StockSummaryPage;

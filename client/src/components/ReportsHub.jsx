// src/components/ReportsHub.jsx
import React from 'react';
import { Container, Row, Col, Card, Button } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { FaBoxes, FaReceipt, FaFileInvoiceDollar, FaChartBar } from 'react-icons/fa';

const reportCards = [
  { title: '📦 Stock Report', path: '/reports/stock', description: 'View stock levels and inventory movement', icon: <FaBoxes /> },
  { title: '🧾 Sales Report', path: '/reports/sales', description: 'Detailed sales report with filters', icon: <FaReceipt /> },
  { title: '💰 Tax Report', path: '/reports/tax', description: 'GST, ACD, and other tax breakdowns', icon: <FaFileInvoiceDollar /> },
  { title: '📊 Profit Summary', path: '/reports/profit', description: 'Total income, tax paid, and margins', icon: <FaChartBar /> },
];

const ReportsHub = () => {
  const navigate = useNavigate();

  return (
    <div className="reports-hub-page">
      <div className="overlay" aria-hidden />
      <Container className="py-4">
        <header className="d-flex align-items-center justify-content-center mb-4">
          <h3 className="m-0 title">📈 Reports Dashboard</h3>
        </header>

        <Row className="g-4">
          {reportCards.map((report, idx) => (
            <Col key={idx} sm={12} md={6} lg={4}>
              <Card className="glass h-100 shadow-sm report-card">
                <Card.Body className="d-flex flex-column">
                  <div className="d-flex align-items-center gap-2 mb-2">
                    <span className="title-icon">{report.icon}</span>
                    <Card.Title className="mb-0 text-dark">{report.title}</Card.Title>
                  </div>
                  <Card.Text className="flex-grow-1 text-muted">{report.description}</Card.Text>
                  <div className="mt-3">
                    <Button
                      className="btn-ghost"
                      onClick={() => navigate(report.path)}
                    >
                      View Report
                    </Button>
                  </div>
                </Card.Body>
              </Card>
            </Col>
          ))}
        </Row>
      </Container>

      <style>{`
        :root{
          --bg:#0d0d0d;
          --accent:#ff4c4c;
          --glass:rgba(255, 255, 255, 0.39);
          --border:rgba(255,76,76,0.35);
          --text:#f5f5f5;
          --muted:#black;
        }
        .reports-hub-page{
          position:relative; min-height:100vh; background:var(--bg); color:var(--text);
          padding: 1rem 0 2rem;
        }
        .reports-hub-page::before{
          content:""; position:absolute; inset:0;
          background: repeating-linear-gradient(120deg, rgba(255,76,76,.05) 0 2px, transparent 2px 20px);
          animation: moveBg 16s linear infinite; z-index:0; pointer-events:none;
        }
        @keyframes moveBg { to { transform: translate(-22%, -22%); } }
        .overlay{ position:absolute; inset:0; background: radial-gradient(900px 520px at top left, rgba(255,76,76,.08), transparent 60%); z-index:1; pointer-events:none; }

        .title{
          letter-spacing:.5px; color:var(--accent); text-shadow:0 2px 10px rgba(255, 76, 76, 0.84);
          text-transform: uppercase;
        }

        .glass{
          position:relative; z-index:2; background: var(--glass);
          border:1px solid var(--border); border-radius:16px;
          box-shadow:0 8px 24px rgba(255,76,76,.12);
        }
        .report-card .card-title { color:#fff; }
        .title-icon{
          display:inline-flex; align-items:center; justify-content:center;
          width:34px; height:34px; border-radius:10px;
          background: rgba(255,76,76,.12); border:1px solid var(--border); color:var(--accent);
          box-shadow: inset 0 0 12px rgba(255,76,76,.15);
        }
        .text-muted{ color: var(--muted) !important; }

        .btn-ghost{
          background: rgba(71, 14, 14, 0.86); border: 1px solid var(--border); color: #fff;
          border-radius: 12px; padding: .5rem 1rem; font-weight:700;
          transition: transform .08s ease, box-shadow .2s ease, background .2s ease;
        }
        .btn-ghost:hover{
          transform: translateY(-1px);
          background: rgba(255,76,76,.15);
          border-color: var(--accent);
          box-shadow: 0 8px 18px rgba(255,76,76,.25);
        }
      `}</style>
    </div>
  );
};

export default ReportsHub;

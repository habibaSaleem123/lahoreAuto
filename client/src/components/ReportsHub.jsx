import React from 'react';
import { Container, Row, Col, Card, Button } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';

const reportCards = [
  { title: '📦 Stock Report', path: '/reports/stock', description: 'View stock levels and inventory movement' },
  { title: '🧾 Sales Report', path: '/reports/sales', description: 'Detailed sales report with filters' },
  { title: '💰 Tax Report', path: '/reports/tax', description: 'GST, ACD, and other tax breakdowns' },
  { title: '📒 Customer Ledger', path: '/reports/ledger/customer', description: 'Customer-wise payment and sale summary' },
  { title: '🏦 Bank Ledger', path: '/reports/ledger/bank', description: 'Bank transactions and balance history' },
  { title: '📊 Profit Summary', path: '/reports/profit', description: 'Total income, tax paid, and margins' },
];

const ReportsHub = () => {
  const navigate = useNavigate();

  return (
    <Container className="my-4">
      <h3 className="mb-4 text-center">📈 Reports Dashboard</h3>

      <Row className="g-4">
        {reportCards.map((report, idx) => (
          <Col key={idx} sm={12} md={6} lg={4}>
            <Card className="h-100 shadow-sm">
              <Card.Body>
                <Card.Title>{report.title}</Card.Title>
                <Card.Text>{report.description}</Card.Text>
                <Button
                  variant="outline-primary"
                  onClick={() => navigate(report.path)}
                >
                  View Report
                </Button>
              </Card.Body>
            </Card>
          </Col>
        ))}
      </Row>
    </Container>
  );
};

export default ReportsHub;

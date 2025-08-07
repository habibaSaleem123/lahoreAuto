import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Table, Container, Row, Col, Modal, Form } from 'react-bootstrap';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const InvoiceView = () => {
  const { invoiceId } = useParams();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState(null);
  const [items, setItems] = useState([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showPaymentPrompt, setShowPaymentPrompt] = useState(false);
  const [banks, setBanks] = useState([]);
  const [selectedBank, setSelectedBank] = useState('');
  const [payerName, setPayerName] = useState('');
  const [receiptFile, setReceiptFile] = useState(null);
  const printRef = useRef();

  useEffect(() => {
    axios.get(`/api/sales/invoice/${invoiceId}`).then(res => {
      setInvoice(res.data.invoice);
      setItems(res.data.items);

      if (res.data.invoice?.fully_refunded) {
        setShowDeleteModal(true);
      }

      if (!res.data.invoice?.is_paid && !res.data.invoice?.fully_refunded) {
        setShowPaymentPrompt(true);
        setPayerName(res.data.invoice.customer_name || '');
      }
    });

    axios.get('/api/banks').then(res => setBanks(res.data.filter(b => b.is_active)));
  }, [invoiceId]);

  const handleDeleteInvoice = async () => {
    try {
      await axios.delete(`/api/sales/invoice/${invoiceId}`);
      alert("✅ Invoice deleted.");
      navigate("/invoices");
    } catch (err) {
      alert("❌ Failed to delete invoice: " + err.message);
    }
  };

  const handleDownloadPDF = () => {
    const doc = new jsPDF('p', 'mm', 'a4');
    const formatDate = (d) => new Date(d).toLocaleDateString('en-GB');

    doc.setFontSize(12).text('INVOICE CUM SALES TAX INVOICE', 70, 15);
    doc.setFontSize(10).text('(U / S 23 of Sales Tax Act 1990)', 78, 20);
    doc.setFontSize(9).text('Original', 170, 10).text('Duplicate', 170, 15);

    doc.text(`NUMBER: ${invoice.invoice_number}`, 14, 30);
    doc.text(`DATE: ${formatDate(invoice.date)}`, 90, 30);
    doc.text(`CODE: 620012`, 150, 30);

    doc.setFont('helvetica', 'bold');
    doc.text(`${invoice.customer_name}`, 14, 40);
    doc.setFont('helvetica', 'normal');
    (invoice.business_name || '').split(',').forEach((line, i) => doc.text(line.trim(), 14, 45 + i * 5));
    doc.text(`STRN : ${invoice.strn || '-'}`, 14, 65);
    doc.text(`NTN  : ${invoice.ntn || '-'}`, 14, 70);

    doc.setFont('helvetica', 'bold');
    doc.text('Atlas DID (Private) Limited', 130, 40);
    doc.setFont('helvetica', 'normal');
    doc.text('15th Mile, National Highway, Landhi, Karachi-75120', 130, 45);
    doc.text('N.T.N. : 6056164-1', 130, 50);
    doc.text('S.T.R. No. : 3277876166266', 130, 55);

    autoTable(doc, {
      startY: 80,
      head: [['HS Code', 'Description', 'Qty', 'Returned', 'Retail', 'Sale', 'Tax', 'Line Total']],
      body: items.map(item => {
        const qty = parseFloat(item.quantity_sold);
        const returned = parseFloat(item.quantity_returned || 0);
        const retail = parseFloat(item.retail_price);
        const sale = parseFloat(item.sale_rate);
        const tax = qty * retail * 0.18;
        const total = qty * sale;
        return [
          item.hs_code,
          item.description,
          qty,
          returned > 0 ? returned : '-',
          `Rs ${retail.toFixed(2)}`,
          `Rs ${sale.toFixed(2)}`,
          `Rs ${tax.toFixed(2)}`,
          `Rs ${total.toFixed(2)}`
        ];
      }),
      styles: { fontSize: 9, halign: 'center' },
      headStyles: { fillColor: [220, 220, 220] }
    });

    const fy = doc.lastAutoTable.finalY;
    const gross = parseFloat(invoice.gross_total || 0);
    const tax = parseFloat(invoice.sales_tax || 0);
    const withholding = gross * (invoice.filer_status === 'filer' ? 0.005 : 0.01);

    doc.text(`Gross Total: Rs ${gross.toFixed(2)}`, 150, fy + 10);
    doc.text(`Sales Tax @ 18%: Rs ${tax.toFixed(2)}`, 150, fy + 16);
    doc.text(`Advance Tax: Rs ${withholding.toFixed(2)}`, 150, fy + 22);
    doc.text(`Total: Rs ${(gross + tax).toFixed(2)}`, 150, fy + 28);

    if (invoice.total_refund) {
      doc.setFont('helvetica', 'bold');
      doc.text(`Refund Issued: Rs ${parseFloat(invoice.total_refund || 0).toFixed(2)}`, 150, fy + 34);
      doc.text(`Tax Reversed: Rs ${parseFloat(invoice.total_refund_tax || 0).toFixed(2)}`, 150, fy + 40);
    }

    doc.text('Atlas DID (Pvt) Limited', 14, fy + 55);
    doc.line(14, fy + 60, 80, fy + 60);
    doc.text('(Authorized Signature)', 14, fy + 65);

    doc.save(`Invoice_${invoice.invoice_number}.pdf`);
  };

  if (!invoice) return <div>Loading...</div>;

  return (
    <Container className="my-4" ref={printRef}>
      <h4 className="text-center">INVOICE CUM SALES TAX INVOICE</h4>
      <Row className="mb-2">
        <Col><strong>Invoice #:</strong> {invoice.invoice_number}</Col>
        <Col><strong>Date:</strong> {new Date(invoice.date).toLocaleDateString('en-GB')}</Col>
      </Row>

      <Row>
        <Col md={6}>
          <h6>Customer</h6>
          <p>
            <strong>{invoice.customer_name}</strong><br />
            {invoice.business_name}<br />
            STRN: {invoice.strn || '-'}<br />
            NTN: {invoice.ntn || '-'}
          </p>
        </Col>
        <Col md={6}>
          <h6>Seller</h6>
          <p>
            <strong>Atlas DID (Private) Limited</strong><br />
            National Highway, Landhi, Karachi<br />
            STRN: 3277876166266<br />
            NTN: 6056164-1
          </p>
        </Col>
      </Row>

      <Table bordered className="mt-3" size="sm">
        <thead>
          <tr>
            <th>HS Code</th>
            <th>Description</th>
            <th>Qty</th>
            <th>Returned</th>
            <th>Retail</th>
            <th>Sale Rate</th>
            <th>Sales Tax</th>
            <th>Line Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => {
            const qty = parseFloat(item.quantity_sold);
            const returned = parseFloat(item.quantity_returned || 0);
            const retail = parseFloat(item.retail_price);
            const sale = parseFloat(item.sale_rate);
            const tax = qty * retail * 0.18;
            const lineTotal = qty * sale;

            return (
              <tr key={item.id}>
                <td>{item.hs_code}</td>
                <td>{item.description}</td>
                <td>{qty}</td>
                <td className="text-danger">{returned > 0 ? returned : '-'}</td>
                <td>Rs {retail.toFixed(2)}</td>
                <td>Rs {sale.toFixed(2)}</td>
                <td>Rs {tax.toFixed(2)}</td>
                <td>Rs {lineTotal.toFixed(2)}</td>
              </tr>
            );
          })}
        </tbody>
      </Table>

      <div className="mt-3">
        <p><strong>Gross Total:</strong> Rs {parseFloat(invoice.gross_total || 0).toFixed(2)}</p>
        <p><strong>Sales Tax:</strong> Rs {parseFloat(invoice.sales_tax || 0).toFixed(2)}</p>
        {invoice.total_refund ? (
          <>
            <p className="text-success"><strong>Refund Issued:</strong> Rs {parseFloat(invoice.total_refund || 0).toFixed(2)}</p>
            <p className="text-success"><strong>Tax Reversed:</strong> Rs {parseFloat(invoice.total_refund_tax || 0).toFixed(2)}</p>
          </>
        ) : null}
      </div>

      <div className="text-end">
        <Button onClick={() => window.print()} variant="outline-primary">🖨️ Print</Button>{' '}
        <Button onClick={handleDownloadPDF} variant="outline-secondary">⬇️ PDF</Button>
      </div>

      {/* 🔔 Modal: Mark Paid Now */}
      <Modal show={showPaymentPrompt} onHide={() => setShowPaymentPrompt(false)} backdrop="static" centered>
        <Modal.Header>
          <Modal.Title>Mark as Paid Now?</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>Did the customer pay the full amount right now?</p>

          <Form.Group className="mb-3">
            <Form.Label>Payment Mode / Bank</Form.Label>
            <Form.Select value={selectedBank} onChange={(e) => setSelectedBank(e.target.value)}>
              <option value="">Select Bank or Cash</option>
              <option value="Cash">Cash</option>
              {banks.map(b => (
                <option key={b.id} value={b.name}>{b.name}</option>
              ))}
            </Form.Select>
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>Payer Name</Form.Label>
            <Form.Control
              value={payerName}
              onChange={(e) => setPayerName(e.target.value)}
              placeholder="Enter payer name"
            />
          </Form.Group>

          <Form.Group>
            <Form.Label>Attach Receipt</Form.Label>
            <Form.Control
              type="file"
              accept="application/pdf,image/*"
              onChange={e => setReceiptFile(e.target.files[0])}
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
        <Button
  variant="success"
  disabled={!selectedBank || !payerName}
  onClick={async () => {
    try {
      const formData = new FormData();
      formData.append('date', new Date().toISOString().split('T')[0]);
      formData.append('type', 'received');
      formData.append('payment_for', 'invoice');
      formData.append('customer_id', invoice.customer_id);
      formData.append('invoice_id', invoice.invoice_number);
      formData.append('amount', invoice.gross_total);
      formData.append('mode', selectedBank === 'Cash' ? 'cash' : 'bank');
      formData.append('remarks', `Paid by ${payerName}`);

      if (selectedBank !== 'Cash') {
        formData.append('bank_name', selectedBank);
      }

      if (receiptFile) {
        formData.append('receipt', receiptFile);
      }

      await axios.post('/api/payments', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      alert('✅ Payment recorded & invoice marked as paid');
      navigate('/invoices');
    } catch (err) {
      const msg = err.response?.data?.error || '❌ Failed to mark invoice as paid';
      alert(msg);
    }
  }}
>
  ✅ Yes, Mark as Paid
</Button>

          <Button variant="secondary" onClick={() => setShowPaymentPrompt(false)}>
            ❌ No, Not Paid Now
          </Button>
        </Modal.Footer>
      </Modal>

      {/* 🗑️ Modal: Delete invoice if fully refunded */}
      <Modal show={showDeleteModal} onHide={() => setShowDeleteModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Delete Invoice?</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          All items in this invoice were returned. Do you want to delete this invoice?
        </Modal.Body>
        <Modal.Footer>
          <Button variant="danger" onClick={handleDeleteInvoice}>Yes, Delete</Button>
          <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>Cancel</Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
};

export default InvoiceView;

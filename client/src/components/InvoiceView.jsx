import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { useParams } from 'react-router-dom';
import { Button, Table, Container, Row, Col } from 'react-bootstrap';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const InvoiceView = () => {
  const { invoiceId } = useParams();
  const [invoice, setInvoice] = useState(null);
  const [items, setItems] = useState([]);
  const printRef = useRef();

  useEffect(() => {
    axios.get(`/api/sales/invoice/${invoiceId}`).then(res => {
      setInvoice(res.data.invoice);
      setItems(res.data.items);
    });
  }, [invoiceId]);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = () => {
    const doc = new jsPDF('p', 'mm', 'a4');

    const formatDate = (dateStr) => {
      const date = new Date(dateStr);
      return `${date.getDate().toString().padStart(2, '0')}-${(date.getMonth()+1).toString().padStart(2, '0')}-${date.getFullYear()}`;
    };

    const gross = parseFloat(invoice.gross_total || 0);
    const tax = parseFloat(invoice.sales_tax || 0);
    const total = gross + tax;
    const isFiler = invoice.filer_status === 'filer';
    const withholdingRate = isFiler ? 0.005 : 0.01;
    const withholdingAmount = gross * withholdingRate;

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('INVOICE CUM SALES TAX INVOICE', 70, 15);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('(U / S 23 of Sales Tax Act 1990)', 78, 20);
    doc.setFontSize(9);
    doc.text('Original', 170, 10);
    doc.text('Duplicate', 170, 15);

    // Invoice Header
    doc.text(`NUMBER: ${invoice.invoice_number}`, 14, 30);
    doc.text(`DATE: ${formatDate(invoice.date)}`, 90, 30);
    doc.text(`CODE: 620012`, 150, 30);

    // Customer Info
    doc.setFont('helvetica', 'bold');
    doc.text(`${invoice.customer_name}`, 14, 40);
    doc.setFont('helvetica', 'normal');
    const customerAddr = invoice.business_name?.split(',') || [];
    customerAddr.forEach((line, i) => doc.text(line.trim(), 14, 45 + i * 5));
    doc.text(`STRN : ${invoice.strn || '-'}`, 14, 55 + customerAddr.length * 5);
    doc.text(`NTN  : ${invoice.ntn || '-'}`, 14, 60 + customerAddr.length * 5);

    // Seller Info
    const rightY = 40;
    doc.setFont('helvetica', 'bold');
    doc.text('Atlas DID (Private) Limited', 130, rightY);
    doc.setFont('helvetica', 'normal');
    doc.text('15th Mile, National Highway, Landhi, Karachi-75120', 130, rightY + 5);
    doc.text('N.T.N. : 6056164-1', 130, rightY + 10);
    doc.text('S.T.R. No. : 3277876166266', 130, rightY + 15);

    // Table
    const tableY = 80;
    autoTable(doc, {
      startY: tableY,
      head: [['Part No', 'Order No', 'Description', 'Qty', 'Price', 'S.Tax', 'Value Exc. S/Tax']],
      body: items.map(item => {
        const qty = parseFloat(item.quantity_sold || 0);
        const saleRate = parseFloat(item.sale_rate || 0);
        const retail = parseFloat(item.retail_price || 0);
        const tax = qty * retail * 0.18;
        const valueExc = qty * saleRate;

        return [
          item.hs_code,
          invoice.invoice_number,
          item.description,
          qty,
          `Rs ${saleRate.toFixed(2)}`,
          `Rs ${tax.toFixed(2)}`,
          `Rs ${valueExc.toFixed(2)}`
        ];
      }),
      styles: { fontSize: 9, halign: 'center' },
      headStyles: { fillColor: [200, 200, 200] },
      columnStyles: {
        0: { cellWidth: 25 },
        1: { cellWidth: 25 },
        2: { cellWidth: 50 },
        3: { cellWidth: 15 },
        4: { cellWidth: 20 },
        5: { cellWidth: 25 },
        6: { cellWidth: 30 },
      }
    });

    const fy = doc.lastAutoTable.finalY;

    // Totals
    doc.text(`Gross Total: Rs ${gross.toFixed(2)}`, 150, fy + 10);
    doc.text(`Sales Tax @ 18%: Rs ${tax.toFixed(2)}`, 150, fy + 16);
    doc.text(`TOTAL: Rs ${total.toFixed(2)}`, 150, fy + 22);
    doc.text(`Less Discount: Rs 0.00`, 150, fy + 28);
    doc.text(`TOTAL: Rs ${total.toFixed(2)}`, 150, fy + 34);
    doc.text(`Advance Income Tax @ ${(withholdingRate * 100).toFixed(2)}%: Rs ${withholdingAmount.toFixed(2)}`, 150, fy + 40);

    // Footer
    doc.setFontSize(10);
    doc.text('This is a system generated invoice.', 14, fy + 55);
    doc.text('For & on behalf of', 14, fy + 62);
    doc.setFont('helvetica', 'bold');
    doc.text('Atlas DID (Pvt) Limited', 14, fy + 68);
    doc.line(14, fy + 75, 80, fy + 75);
    doc.setFont('helvetica', 'normal');
    doc.text('(Signature of Authorised Person)', 14, fy + 80);

    doc.save(`Invoice_${invoice.invoice_number}.pdf`);
  };

  if (!invoice) return <div>Loading...</div>;

  return (
    <Container className="my-4" ref={printRef}>
      <div className="text-center mb-3">
        <h5>INVOICE CUM SALES TAX INVOICE</h5>
        <div>(U/S 23 of Sales Tax Act 1990)</div>
        <div>Original / Duplicate</div>
      </div>

      <Row className="mb-2">
        <Col><strong>Invoice #:</strong> {invoice.invoice_number}</Col>
        <Col><strong>Date:</strong> {
          new Date(invoice.date).toLocaleDateString('en-GB') || '-'
        }</Col>
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
            15th Mile, National Highway, Landhi, Karachi<br />
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
            <th>Quantity</th>
            <th>Retail Price</th>
            <th>Sale Rate</th>
            <th>Sales Tax</th>
            <th>Value Exc. ST</th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => {
            const retail = parseFloat(item.retail_price || 0);
            const sale = parseFloat(item.sale_rate || 0);
            const qty = parseFloat(item.quantity_sold || 0);
            const tax = qty * retail * 0.18;
            const valueExc = qty * sale;
            return (
              <tr key={item.id}>
                <td>{item.hs_code}</td>
                <td>{item.description}</td>
                <td>{qty}</td>
                <td>Rs {retail.toFixed(2)}</td>
                <td>Rs {sale.toFixed(2)}</td>
                <td>Rs {tax.toFixed(2)}</td>
                <td>Rs {valueExc.toFixed(2)}</td>
              </tr>
            );
          })}
        </tbody>
      </Table>

      <div className="mt-4">
        <p><strong>Gross Total:</strong> Rs {parseFloat(invoice.gross_total || 0).toFixed(2)}</p>
        <p><strong>Sales Tax (18%):</strong> Rs {parseFloat(invoice.sales_tax || 0).toFixed(2)}</p>
        <p><strong>Total (Incl. Tax):</strong> Rs {(parseFloat(invoice.gross_total || 0) + parseFloat(invoice.sales_tax || 0)).toFixed(2)}</p>
        {(() => {
          const gross = parseFloat(invoice.gross_total || 0);
          const isFiler = invoice.filer_status === 'filer';
          const withholdingRate = isFiler ? 0.005 : 0.01;
          const withholdingAmount = gross * withholdingRate;
          return (
            <p>
              <strong>Advance Income Tax:</strong> {withholdingRate * 100}% — Rs {withholdingAmount.toFixed(2)}
            </p>
          );
        })()}
        <p><strong>Gross Profit:</strong> Rs {parseFloat(invoice.gross_profit || 0).toFixed(2)}</p>
      </div>

      <div className="text-center mt-4">
        <p>This is a system generated invoice.</p>
        <p><strong>For & on behalf of<br />Atlas DID (Pvt) Limited</strong></p>
        <p style={{ marginTop: '40px' }}>_________________________<br />Signature of Authorised Person</p>
      </div>

      <div className="text-end mt-4">
        <Button variant="outline-primary" onClick={handlePrint}>🖨️ Print</Button>{' '}
        <Button variant="outline-secondary" onClick={handleDownloadPDF}>⬇️ PDF</Button>
      </div>
    </Container>
  );
};

export default InvoiceView;

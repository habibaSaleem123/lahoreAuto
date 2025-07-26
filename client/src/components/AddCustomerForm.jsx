import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Form, Button, Container } from 'react-bootstrap';

const AddCustomerForm = ({ initialData = null, onSuccess }) => {
  const [form, setForm] = useState({
    name: '',
    business_name: '',
    address: '',
    cnic: '',
    mobile: '',
    filer_status: 'non-filer',
    credit_limit: 0,
  });

  // When editing, prefill the form
  useEffect(() => {
    if (initialData) {
      setForm({
        name: initialData.name || '',
        business_name: initialData.business_name || '',
        address: initialData.address || '',
        cnic: initialData.cnic || '',
        mobile: initialData.mobile || '',
        filer_status: initialData.filer_status || 'non-filer',
        credit_limit: initialData.credit_limit || 0,
      });
    }
  }, [initialData]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const url = initialData
        ? `/api/customers/${initialData.id}`
        : '/api/customers';
      const method = initialData ? 'put' : 'post';
      await axios[method](url, form);

      alert(`✅ Customer ${initialData ? 'updated' : 'added'} successfully!`);
      // reset only on add
      if (!initialData) {
        setForm({
          name: '',
          business_name: '',
          address: '',
          cnic: '',
          mobile: '',
          filer_status: 'non-filer',
          credit_limit: 0,
        });
      }
      onSuccess && onSuccess();
    } catch (err) {
      const msg = err.response?.data?.error || 'Operation failed';
      alert(`❌ ${msg}`);
    }
  };

  return (
    <Container className="mb-4">
      <h5>{initialData ? 'Edit Customer' : 'Add New Customer'}</h5>
      <Form onSubmit={handleSubmit}>
        <Form.Group className="mb-2">
          <Form.Label>Name</Form.Label>
          <Form.Control
            name="name"
            value={form.name}
            onChange={handleChange}
            required
          />
        </Form.Group>

        <Form.Group className="mb-2">
          <Form.Label>Business Name</Form.Label>
          <Form.Control
            name="business_name"
            value={form.business_name}
            onChange={handleChange}
          />
        </Form.Group>

        <Form.Group className="mb-2">
          <Form.Label>Address</Form.Label>
          <Form.Control
            name="address"
            value={form.address}
            onChange={handleChange}
          />
        </Form.Group>

        <Form.Group className="mb-2">
          <Form.Label>CNIC</Form.Label>
          <Form.Control
            name="cnic"
            value={form.cnic}
            onChange={handleChange}
            required
          />
        </Form.Group>

        <Form.Group className="mb-2">
          <Form.Label>Mobile</Form.Label>
          <Form.Control
            name="mobile"
            value={form.mobile}
            onChange={handleChange}
            required
          />
        </Form.Group>

        <Form.Group className="mb-2">
          <Form.Label>Credit Limit</Form.Label>
          <Form.Control
            type="number"
            min="0"
            name="credit_limit"
            value={form.credit_limit}
            onChange={handleChange}
          />
        </Form.Group>

        <Form.Group className="mb-3">
          <Form.Label>Filer Status</Form.Label>
          <Form.Select
            name="filer_status"
            value={form.filer_status}
            onChange={handleChange}
          >
            <option value="filer">Filer</option>
            <option value="non-filer">Non-Filer</option>
          </Form.Select>
        </Form.Group>

        <Button type="submit">
          {initialData ? 'Save Changes' : 'Add Customer'}
        </Button>
      </Form>
    </Container>
  );
};

export default AddCustomerForm;

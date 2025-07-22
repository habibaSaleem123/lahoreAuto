import React, { useState } from 'react';
import axios from 'axios';
import { Form, Button, Container } from 'react-bootstrap';

const AddCustomerForm = ({ onSuccess }) => {
  const [form, setForm] = useState({
    name: '',
    business_name: '',
    address: '',
    cnic: '',
    filer_status: 'non-filer',
  });

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };
  const handleSubmit = async (e) => {
    e.preventDefault();
    const res = await axios.post('/api/customers', form);
    const newCustomer = res.data;
  
    alert('✅ Customer added!');
    setForm({
      name: '',
      business_name: '',
      address: '',
      cnic: '',
      filer_status: 'non-filer',
    });
  
    if (onSuccess) onSuccess(newCustomer); // pass full customer object
  };
  

  return (
    <Container className="mb-4">
      <h5>Add New Customer</h5>
      <Form onSubmit={handleSubmit}>
        <Form.Group className="mb-2">
          <Form.Label>Name</Form.Label>
          <Form.Control name="name" value={form.name} onChange={handleChange} required />
        </Form.Group>

        <Form.Group className="mb-2">
          <Form.Label>Business Name</Form.Label>
          <Form.Control name="business_name" value={form.business_name} onChange={handleChange} />
        </Form.Group>

        <Form.Group className="mb-2">
          <Form.Label>Address</Form.Label>
          <Form.Control name="address" value={form.address} onChange={handleChange} />
        </Form.Group>

        <Form.Group className="mb-2">
          <Form.Label>CNIC</Form.Label>
          <Form.Control name="cnic" value={form.cnic} onChange={handleChange} />
        </Form.Group>

        <Form.Group className="mb-3">
          <Form.Label>Filer Status</Form.Label>
          <Form.Select name="filer_status" value={form.filer_status} onChange={handleChange}>
            <option value="filer">Filer</option>
            <option value="non-filer">Non-Filer</option>
          </Form.Select>
        </Form.Group>

        <Button type="submit">Add Customer</Button>
      </Form>
    </Container>
  );
};

export default AddCustomerForm;

import supertest from 'supertest';
import { strict as assert } from 'assert';
import app from '../app.js';

const request = supertest(app);

describe('API Tests', () => {
    // get all members test
    it('should get all members', async () => {
        const res = await request.get('/members');
        assert.equal(res.status, 200);
        assert(Array.isArray(res.body));
    });
  
    // get all books test
    it('should get all books', async () => {
        const res = await request.get('/books');
        assert.equal(res.status, 200);
        assert(Array.isArray(res.body));
    });

    // get all available books test
    it('should get all available books', async () => {
        const res = await request.get('/availableBooks');
        assert.equal(res.status, 200);
        assert(Array.isArray(res.body));
    });

    // post borrow book test
    it('should post borrow book', async () => {
        const borrowData = {
            memberCode: 'M002',
            bookCode: 'TW-11'
        };

        const res = await request.post('/borrowBook').send(borrowData);
        assert.equal(res.status, 200);
        assert.equal(res.text, 'Book borrowed successfully');
    });

    // post return book test
    it('should post return book', async () => {
        const returnData = {
            memberCode: 'M002',
            bookCode: 'TW-11'
        };

        const res = await request.post('/returnBook').send(returnData);
        assert.equal(res.status, 200);
        assert.equal(res.text, 'Book returned successfully');
    });
});
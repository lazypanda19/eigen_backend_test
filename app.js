import express from 'express';
import mysql from 'mysql2';

// swagger
import swaggerJsDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

const app = express();
const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'eigen'
});

const PORT = 3000;
app.use(express.json());

// function get all members
function getAllMembers(connection, callback) {
    const query = 'SELECT T0.*, COUNT(T1.member_code) AS borrowed_books_count FROM members T0 LEFT JOIN borrowed_books T1 ON T1.member_code = T0.code AND T1.returned_at IS NULL GROUP BY T0.code';

    connection.query(query, (err, results) => {
        if (err) return callback(err);

        if (results.length > 0) {
            callback(null, results);
        } else {
            callback(null, 'No members found');
        }
    });
};

// function get all books
function getAllBooks(connection, callback) {
    const query = 'SELECT * FROM books';

    connection.query(query, (err, results) => {
        if (err) return callback(err);

        if (results.length > 0) {
            callback(null, results);
        } else {
            callback(null, 'No books found');
        }
    });
};

// function get available books
function getAvailableBooks(connection, callback) {
    const query = 'SELECT * FROM books WHERE stock > 0';

    connection.query(query, (err, results) => {
        if (err) return callback(err);

        if (results.length > 0) {
            callback(null, results);
        } else {
            callback(null, 'No available books found');
        }
    });
};

// function count borrowed books by member
function countBorrowedBookByMember(connection, memberCode, callback) {
    const query = 'SELECT COUNT(*) as borrowedBook FROM borrowed_books WHERE returned_at IS NULL AND member_code = ?';

    connection.query(query, [memberCode], (err, results) => {
        if (err) return callback(err);

        const borrowedBook = results[0].borrowedBook;
        callback(null, borrowedBook || 0);
    });
};

// function check borrowed book record
function checkBorrowedRecordByMember(connection, memberCode, bookCode, callback) {
    const query = 'SELECT * FROM borrowed_books WHERE returned_at IS NULL AND member_code = ? AND book_code = ?';

    connection.query(query, [memberCode, bookCode], (err, results) => {
        if (err) return callback(err);

        const borrowedBook = results[0];
        callback(null, borrowedBook);
    });
};

// function borrow book
function borrowBook(connection, memberCode, bookCode, callback) {
    const borrowedAt = Math.floor(Date.now() / 1000);

    // check if member is in penalty time
    const penaltyTimeQuery = 'SELECT penalty_until FROM members WHERE code = ?';

    connection.query(penaltyTimeQuery, [memberCode], (err, results) => {
        if (results[0].penalty_until > borrowedAt) {
            return callback(new Error('This member is still in Penalty Time'));
        } else {
            // Get the stock of the borrowed book
            const bookQuery = 'SELECT stock FROM books WHERE code = ?';

            connection.query(bookQuery, [bookCode], (err, stockResults) => {
                if (err) return callback(err);

                if (stockResults.length === 0) {
                    return callback(new Error('Book not found'));
                }

                const currentStock = stockResults[0].stock;

                if (currentStock <= 0) {
                    return callback(new Error('The book is out of stock'));
                }

                // Update Stock Book
                const updatedStock = currentStock - 1;
                const updateStockQuery = 'UPDATE books SET stock = ? WHERE code = ?';

                connection.query(updateStockQuery, [updatedStock, bookCode], (err) => {
                    if (err) return callback(err);

                    // Insert the borrowed book data
                    const borrowQuery = 'INSERT INTO borrowed_books (member_code, book_code, borrowed_at) VALUES (?, ?, ?)';

                    connection.query(borrowQuery, [memberCode, bookCode, borrowedAt], (err) => {
                        if (err) return callback(err);
                        
                        callback(null, true);
                    });
                });
            });
        }
    });
}

// function return book
function returnBook(connection, memberCode, bookCode, callback) {
    const returnedAt = Math.floor(Date.now() / 1000);
    const penaltyTimeDiff = 7 * 24 * 60 * 60; // 7 days in seconds

    const returnQuery = 'SELECT * FROM borrowed_books WHERE member_code = ? AND book_code = ? AND returned_at IS NULL';

    connection.query(returnQuery, [memberCode, bookCode], (err, returnResults) => {
        if (err) return callback(err);

        if (returnResults.length === 0) {
            return callback(new Error('Borrowed record not found'));
        }

        const borrowedAt = returnResults[0].borrowed_at;
        const timeDiff = returnedAt - borrowedAt;
        const isLate = timeDiff > penaltyTimeDiff;

        // Get the stock of the book
        const bookQuery = 'SELECT stock FROM books WHERE code = ?';
        
        connection.query(bookQuery, [bookCode], (err, stockResults) => {
            if (err) return callback(err);

            if (stockResults.length === 0) {
                return callback(new Error('Book not found'));
            }

            const updateReturnedAtQuery = 'UPDATE borrowed_books SET returned_at = ? WHERE book_code = ? AND member_code = ?';

            connection.query(updateReturnedAtQuery, [returnedAt, bookCode, memberCode], (err) => {
                if (err) return callback(err);

                // Update Stock Book
                const currentStock = stockResults[0].stock;
                const updatedStock = currentStock + 1;
                const updateStockQuery = 'UPDATE books SET stock = ? WHERE code = ?';
                
                connection.query(updateStockQuery, [updatedStock, bookCode], (err) => {
                    if (err) return callback(err);

                    // Apply penalty if returned late
                    if (isLate) {
                        const penaltyUntil = returnedAt + (3 * 24 * 60 * 60); // 3 days in seconds
                        const penaltyQuery = 'UPDATE members SET penalty_until = ? WHERE code = ?';

                        connection.query(penaltyQuery, [penaltyUntil, memberCode], (err) => {
                            if (err) return callback(err);

                            callback(null, { success: true, message: 'Book returned with penalty' });
                        });
                    } else {
                        callback(null, { success: true, message: 'Book returned successfully' });
                    }
                });
            });
        });
    });
}

// Swagger Documentation route /members
/**
 * @swagger
 * /members:
 *   get:
 *     summary: Get all members
 *     responses:
 *       200:
 *         description: A list of members
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   code:
 *                     type: string
 *                   name:
 *                     type: string
 *                   borrowed_books_count:
 *                     type: integer
 */

// route all members
app.get('/members', (req, res) => {
    getAllMembers(connection, (err, members) => {
        if (err) {
            return res.status(500).send('Error: ' + err.message);
        }
        res.json(members);
    });
});

// Swagger Documentation route /books
/**
 * @swagger
 * /books:
 *   get:
 *     summary: Get all books
 *     responses:
 *       200:
 *         description: A list of books
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   code:
 *                     type: string
 *                   title:
 *                     type: string
 *                   stock:
 *                     type: integer
 */

// route all books
app.get('/books', (req, res) => {
    getAllBooks(connection, (err, books) => {
        if (err) {
            return res.status(500).send('Error: ' + err.message);
        }
        res.json(books);
    });
});

// Swagger Documentation route /availableBooks
/**
 * @swagger
 * /availableBooks:
 *   get:
 *     summary: Get all available books
 *     responses:
 *       200:
 *         description: A list of available books
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   code:
 *                     type: string
 *                   title:
 *                     type: string
 *                   stock:
 *                     type: integer
 */

// route available books
app.get('/availableBooks', (req, res) => {
    getAvailableBooks(connection, (err, availableBooks) => {
        if (err) {
            return res.status(500).send('Error: ' + err.message);
        }
        res.json(availableBooks);
    });
});

// Swagger Documentation route /borrowBook
/**
 * @swagger
 * /borrowBook:
 *   post:
 *     summary: Borrow a book
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               memberCode:
 *                 type: string
 *               bookCode:
 *                 type: string
 *     responses:
 *       200:
 *         description: Book borrowed successfully
 *       400:
 *         description: Error message if borrowing fails
 *       500:
 *         description: Server error
 */

// route borrow book
app.post('/borrowBook', (req, res) => {
    const { memberCode, bookCode } = req.body;

    // check if member already borrowed 2 books
    countBorrowedBookByMember(connection, memberCode, (err, borrowedBook) => {
        if (err) {
            return res.status(500).send('Error: ' + err.message);
        }

        if (borrowedBook >= 2) {
            return res.status(400).send('This member has already borrowed 2 books');
        }

        // Proceed with borrowing the book
        borrowBook(connection, memberCode, bookCode, (err, result) => {
            if (err) {
                return res.status(500).send('Error: ' + err.message);
            }
            
            if (result === true) {
                return res.send('Book borrowed successfully');
            }
        });
    });
});

// Swagger Documentation route /returnBook
/**
 * @swagger
 * /returnBook:
 *   post:
 *     summary: Return a borrowed book
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               memberCode:
 *                 type: string
 *               bookCode:
 *                 type: string
 *     responses:
 *       200:
 *         description: Book returned successfully
 *       400:
 *         description: Error message if returning fails
 *       500:
 *         description: Server error
 */

// route return book
app.post('/returnBook', (req, res) => {
    const { memberCode, bookCode } = req.body;

    // check borrowed book record
    checkBorrowedRecordByMember(connection, memberCode, bookCode, (err, result) => {
        if (err) {
            return res.status(500).send('Error: ' + err.message);
        }

        if (!result) {
            return res.status(400).send('This member has not borrowed this book');
        }

        returnBook(connection, memberCode, bookCode, (err, result) => {
            if (err) {
                return res.status(500).send('Error: ' + err.message);
            }

            if (result) {
                return res.send(result.message);
            }
        });
    });
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

// Swagger Documentation
const swaggerOptions = {
    swaggerDefinition: {
        openapi: '3.0.0',
        info: {
            title: 'Book API',
            version: '1.0.0',
            description: 'Eigen Backend Test',
        },
        servers: [
            {
                url: `http://localhost:${PORT}`,
            },
        ],
    },
    apis: ['./app.js'],
};

const swaggerDocs = swaggerJsDoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

export default app;

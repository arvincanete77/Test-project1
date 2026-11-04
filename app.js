const USERS_KEY = "brbs_djc_users";
const SESSION_KEY = "brbs_djc_session";
const RECORDS_KEY = "brbs_djc_borrow_records";
const BOOKS_KEY = "brbs_djc_books";

const $ = id => document.getElementById(id);

function read(key) {
    try {
        return JSON.parse(localStorage.getItem(key) || "[]");
    } catch {
        return [];
    }
}

const getUsers = () => read(USERS_KEY);
const getRecords = () => read(RECORDS_KEY);

const saveRecords = records =>
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records));

const saveBooks = books =>
    localStorage.setItem(BOOKS_KEY, JSON.stringify(books));

// Inventory system. Migrates existing saved books automatically.
function getBooks() {
    const books = read(BOOKS_KEY);
    const records = read(RECORDS_KEY);
    let changed = false;

    const updatedBooks = books.map(book => {
        const borrowedCount = records.filter(record =>
            record.status === "Borrowed" &&
            String(record.isbn).toLowerCase() ===
            String(book.isbn).toLowerCase()
        ).length;

        let quantity = Number(book.quantity);
        let available = Number(book.availableCopies);

        if (!Number.isFinite(quantity) || quantity < 1) {
            quantity = Math.max(1, borrowedCount + 1);
            available = 1;
            changed = true;
        } else if (
            !Number.isFinite(available) ||
            available < 0
        ) {
            available = Math.max(0, quantity - borrowedCount);
            changed = true;
        }

        quantity = Math.max(1, Math.floor(quantity));
        available = Math.max(
            0,
            Math.min(quantity, Math.floor(available))
        );

        if (
            book.quantity !== quantity ||
            book.availableCopies !== available
        ) {
            changed = true;
        }

        return {
            ...book,
            quantity,
            availableCopies: available
        };
    });

    if (changed) {
        saveBooks(updatedBooks);
    }

    return updatedBooks;
}

function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    }[char]));
}

function msg(element, text, ok = false) {
    if (element) {
        element.textContent = text;
        element.className = "message" + (ok ? " success" : "");
    }
}

function id() {
    return Date.now().toString(36) +
        Math.random().toString(36).slice(2, 8);
}

function today() {
    const date = new Date();
    return new Date(
        date - date.getTimezoneOffset() * 60000
    ).toISOString().slice(0, 10);
}

function user() {
    try {
        return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    } catch {
        return null;
    }
}

function guard() {
    const currentUser = user();

    if (!currentUser) {
        location.href = "Login.html";
    }

    return currentUser;
}

function logout() {
    const button = $("logoutBtn");

    if (button) {
        button.onclick = () => {
            localStorage.removeItem(SESSION_KEY);
            location.href = "Login.html";
        };
    }
}

// SIGN UP
const signup = $("signup-form");

if (signup) {
    signup.onsubmit = event => {
        event.preventDefault();

        const username = $("username").value.trim();
        const password = $("password").value;
        const confirm = $("confirmPassword").value;
        const position = $("position").value;

        if (!username || !password || !confirm || !position) {
            return msg($("message"), "Complete all fields.");
        }

        if (password.length < 6) {
            return msg(
                $("message"),
                "Password must be at least 6 characters."
            );
        }

        if (password !== confirm) {
            return msg($("message"), "Passwords do not match.");
        }

        const users = getUsers();

        if (users.some(
            account =>
                account.username.toLowerCase() === username.toLowerCase()
        )) {
            return msg($("message"), "Username already exists.");
        }

        users.push({ username, password, position });

        localStorage.setItem(USERS_KEY, JSON.stringify(users));

        msg(
            $("message"),
            "Account created. You can now log in.",
            true
        );

        signup.reset();
    };
}

// LOGIN
const login = $("login-form");

if (login) {
    login.onsubmit = event => {
        event.preventDefault();

        const username = $("username").value.trim();
        const password = $("password").value;
        const position = $("position").value;

        const account = getUsers().find(
            item =>
                item.username.toLowerCase() === username.toLowerCase() &&
                item.password === password &&
                item.position === position
        );

        if (!account) {
            return msg(
                $("message"),
                "Invalid username, password, or position."
            );
        }

        localStorage.setItem(
            SESSION_KEY,
            JSON.stringify({
                username: account.username,
                position: account.position
            })
        );

        location.href = "dashboard.html";
    };
}

// DASHBOARD
if ($("profileName") || $("recentBorrowRecords") || $("bookCount")) {
    const currentUser = guard();

    if (currentUser) {
        $("profileName").textContent = currentUser.username;
        $("profilePosition").textContent = currentUser.position;

        const books = getBooks();
        const records = getRecords();

        $("bookCount").textContent = books.length;

        $("borrowedCount").textContent =
            records.filter(record => record.status === "Borrowed").length;

        $("returnedCount").textContent =
            records.filter(record => record.status === "Returned").length;

        const role = String(currentUser.position).trim().toLowerCase();

        if (["student", "staff"].includes(role)) {
            $("recentBorrowSection")?.remove();
        } else {
            const latest = records
                .slice()
                .sort(
                    (a, b) =>
                        new Date(b.borrowedAt || 0) -
                        new Date(a.borrowedAt || 0)
                )
                .slice(0, 5);

            $("recentBorrowRecords").innerHTML = latest.length
                ? latest.map(record => `
                    <article class="record">
                        <h3>${esc(record.studentName)} — ${esc(record.title)}</h3>
                        <p>LRN: ${esc(record.lrn)} · ISBN: ${esc(record.isbn)}</p>
                        <p>Borrowed: ${esc(record.borrowDate)} · Status: ${esc(record.status)}</p>
                    </article>
                `).join("")
                : '<p class="empty">No borrowing records yet.</p>';
        }
    }
}

// BOOK CATALOG AND INVENTORY
const bf = $("bookForm");

if (bf) {
    const currentUser = guard();

    if (currentUser) {
        let editing = "";

        const wrap = $("booksTableWrap");
        const search = $("bookSearch");

        function renderBooks() {
            const query = search.value.trim().toLowerCase();

            const list = getBooks()
                .filter(book =>
                    [book.isbn, book.name, book.author].some(value =>
                        String(value ?? "").toLowerCase().includes(query)
                    )
                )
                .sort((a, b) => a.name.localeCompare(b.name));

            $("bookTotal").textContent = list.length + " book(s)";

            wrap.innerHTML = list.length
                ? `
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>ISBN</th>
                                <th>Book name</th>
                                <th>Author</th>
                                <th>Total copies</th>
                                <th>Available</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${list.map(book => `
                                <tr>
                                    <td>${esc(book.isbn)}</td>
                                    <td>${esc(book.name)}</td>
                                    <td>${esc(book.author)}</td>
                                    <td>${book.quantity}</td>
                                    <td>${book.availableCopies}</td>
                                    <td>
                                        <button
                                            class="small-btn"
                                            data-edit="${esc(book.id)}"
                                        >Edit</button>

                                        <button
                                            class="small-btn danger"
                                            data-delete="${esc(book.id)}"
                                        >Delete</button>
                                    </td>
                                </tr>
                            `).join("")}
                        </tbody>
                    </table>
                `
                : '<div class="empty">No books found. Add a book above.</div>';
        }

        function resetBookForm() {
            bf.reset();
            editing = "";

            $("bookId").value = "";
            $("bookFormHeading").textContent = "Add a Book";
            $("bookSubmitBtn").textContent = "Save Book";
            $("cancelBookEdit").classList.add("hidden");
        }

        bf.onsubmit = event => {
            event.preventDefault();

            const isbn = $("bookISBN").value.trim();
            const name = $("bookName").value.trim();
            const author = $("bookAuthor").value.trim();

            const books = getBooks();

            if (!isbn || !name || !author) {
                return msg(
                    $("bookMessage"),
                    "Enter the ISBN, book name, and author."
                );
            }

            if (books.some(
                book =>
                    book.isbn.toLowerCase() === isbn.toLowerCase() &&
                    book.id !== editing
            )) {
                return msg(
                    $("bookMessage"),
                    "That ISBN is already saved. Edit the existing book."
                );
            }

            if (editing) {
                const index = books.findIndex(book => book.id === editing);

                if (index < 0) {
                    return msg(
                        $("bookMessage"),
                        "Book not found. Refresh and try again."
                    );
                }

                books[index] = {
                    ...books[index],
                    isbn,
                    name,
                    author
                };

                saveBooks(books);

                msg(
                    $("bookMessage"),
                    "Book updated successfully.",
                    true
                );
            } else {
                // New books start with one available copy.
                books.push({
                    id: id(),
                    isbn,
                    name,
                    author,
                    quantity: 1,
                    availableCopies: 1,
                    createdAt: new Date().toISOString()
                });

                saveBooks(books);

                msg(
                    $("bookMessage"),
                    "Book saved successfully. Available copies: 1.",
                    true
                );
            }

            resetBookForm();
            renderBooks();
        };

        $("cancelBookEdit").onclick = resetBookForm;
        search.oninput = renderBooks;

        wrap.onclick = event => {
            const editButton = event.target.closest("[data-edit]");
            const deleteButton = event.target.closest("[data-delete]");

            if (editButton) {
                const book = getBooks().find(
                    item => item.id === editButton.dataset.edit
                );

                if (!book) return;

                editing = book.id;

                $("bookId").value = book.id;
                $("bookISBN").value = book.isbn;
                $("bookName").value = book.name;
                $("bookAuthor").value = book.author;

                $("bookFormHeading").textContent = "Edit Book";
                $("bookSubmitBtn").textContent = "Update Book";
                $("cancelBookEdit").classList.remove("hidden");

                window.scrollTo(0, 0);
            }

            if (deleteButton) {
                const book = getBooks().find(
                    item => item.id === deleteButton.dataset.delete
                );

                if (!book) return;

                const hasBorrowedCopies = getRecords().some(
                    record =>
                        record.status === "Borrowed" &&
                        String(record.isbn).toLowerCase() ===
                        String(book.isbn).toLowerCase()
                );

                if (hasBorrowedCopies) {
                    return msg(
                        $("bookMessage"),
                        "This book cannot be deleted while copies are borrowed."
                    );
                }

                if (confirm(`Delete "${book.name}" from book storage?`)) {
                    saveBooks(
                        getBooks().filter(item => item.id !== book.id)
                    );

                    renderBooks();

                    msg($("bookMessage"), "Book deleted.", true);
                }
            }
        };

        $("exportBooksBtn").onclick = () => {
            const rows = [
                [
                    "ISBN",
                    "Book name",
                    "Author",
                    "Total copies",
                    "Available copies"
                ],
                ...getBooks().map(book => [
                    book.isbn,
                    book.name,
                    book.author,
                    book.quantity,
                    book.availableCopies
                ])
            ];

            const csv = rows.map(row =>
                row.map(value =>
                    '"' + String(value).replace(/"/g, '""') + '"'
                ).join(",")
            ).join("\r\n");

            download(
                "brbs-books.csv",
                csv,
                "text/csv;charset=utf-8;"
            );
        };

        renderBooks();
    }
}

// DOWNLOAD HELPER
function download(filename, content, type) {
    const anchor = document.createElement("a");
    const url = URL.createObjectURL(new Blob([content], { type }));

    anchor.href = url;
    anchor.download = filename;
    anchor.click();

    URL.revokeObjectURL(url);
}

// BORROWING
const borrow = $("borrowForm");

if (borrow) {
    const currentUser = guard();

    if (currentUser) {
        $("borrowDate").value = today();

        function fillBookOptions() {
            const select = $("borrowBookSelect");
            const previous = select.value;

            const books = getBooks().sort(
                (a, b) => a.name.localeCompare(b.name)
            );

            select.innerHTML =
                '<option value="">Choose a book</option>' +
                books.map(book => {
                    const available = Number(book.availableCopies) || 0;
                    const unavailable = available <= 0;

                    return `
                        <option
                            value="${esc(book.id)}"
                            ${unavailable ? "disabled" : ""}
                        >
                            ${esc(book.name)} — ${esc(book.isbn)}
                            (Available: ${available})
                            ${unavailable ? " — OUT OF STOCK" : ""}
                        </option>
                    `;
                }).join("");

            if (books.some(book => book.id === previous)) {
                select.value = previous;
            }
        }

        fillBookOptions();

        $("borrowBookSelect").onchange = () => {
            const book = getBooks().find(
                item => item.id === $("borrowBookSelect").value
            );

            if (book) {
                $("isbn").value = book.isbn;
                $("bookTitle").value = book.name;
                $("author").value = book.author;
            }
        };

        borrow.onsubmit = event => {
            event.preventDefault();

            const lrn = $("lrn").value.trim();
            const studentName = $("studentName").value.trim();
            const isbn = $("isbn").value.trim();
            const title = $("bookTitle").value.trim();
            const author = $("author").value.trim();
            const borrowDate = $("borrowDate").value;

            if (
                !lrn ||
                !studentName ||
                !isbn ||
                !title ||
                !author ||
                !borrowDate
            ) {
                return msg(
                    $("borrowMessage"),
                    "Complete all fields."
                );
            }

            // Match the entered ISBN to a book in storage.
            const books = getBooks();

            const storedBook = books.find(
                book =>
                    String(book.isbn).toLowerCase() ===
                    isbn.toLowerCase()
            );

            // Do not allow borrowing a catalog book with no copies left.
            if (storedBook && storedBook.availableCopies <= 0) {
                fillBookOptions();

                return msg(
                    $("borrowMessage"),
                    "This book is out of stock. No copies are available."
                );
            }

            const records = getRecords();

            records.push({
                id: id(),
                lrn,
                studentName,
                isbn,
                title,
                author,
                borrowDate,
                borrowedAt: new Date().toISOString(),
                status: "Borrowed",
                returnedAt: null,
                returnedDate: null
            });

            // Remove one available copy from storage.
            if (storedBook) {
                storedBook.availableCopies -= 1;
                saveBooks(books);
            }

            saveRecords(records);

            msg(
                $("borrowMessage"),
                storedBook
                    ? `Borrowing saved. ${storedBook.availableCopies} copy/copies remain available.`
                    : "Borrowing record saved. This ISBN is not in the book catalog, so inventory was not changed.",
                true
            );

            borrow.reset();
            $("borrowDate").value = today();

            fillBookOptions();
        };
    }
}

// RETURNS AND RETURN HISTORY
const rf = $("returnSearchForm");

if (rf) {
    const currentUser = guard();

    if (currentUser) {
        let active = "";

        function history(lrn) {
            const rows = getRecords()
                .filter(
                    record =>
                        record.lrn === lrn &&
                        record.status === "Returned"
                )
                .sort(
                    (a, b) =>
                        new Date(b.returnedAt || 0) -
                        new Date(a.returnedAt || 0)
                );

            $("returnHistory").innerHTML = rows.length
                ? rows.map(record => `
                    <article class="record">
                        <h3>${esc(record.title)}</h3>
                        <p>ISBN: ${esc(record.isbn)} · Author: ${esc(record.author)}</p>
                        <p>Returned: ${esc(record.returnedDate || "—")}</p>
                    </article>
                `).join("")
                : '<p class="empty">No returned books found for this LRN.</p>';
        }

        function borrowed(lrn) {
            active = lrn;

            const rows = getRecords().filter(
                record =>
                    record.lrn === lrn &&
                    record.status === "Borrowed"
            );

            $("returnResults").innerHTML = rows.length
                ? rows.map(record => `
                    <article class="record">
                        <label>
                            <input
                                type="checkbox"
                                class="return-check"
                                value="${esc(record.id)}"
                            >
                            ${esc(record.title)}
                        </label>

                        <p>ISBN: ${esc(record.isbn)} · Author: ${esc(record.author)}</p>
                        <p>Borrowed: ${esc(record.borrowDate)} · Student: ${esc(record.studentName)}</p>
                    </article>
                `).join("") + '<button id="confirmReturnBtn">Confirm Selected Returns</button>'
                : '<p class="empty">No books currently borrowed under this LRN.</p>';

            const button = $("confirmReturnBtn");

            if (button) {
                button.onclick = () => {
                    const selectedIds = [
                        ...document.querySelectorAll(".return-check:checked")
                    ].map(checkbox => checkbox.value);

                    if (!selectedIds.length) {
                        return msg(
                            $("returnMessage"),
                            "Select at least one book."
                        );
                    }

                    if (!confirm(
                        `Confirm return of ${selectedIds.length} book(s)?`
                    )) {
                        return;
                    }

                    const records = getRecords();
                    const books = getBooks();
                    const now = new Date();

                    let returnedCount = 0;

                    records.forEach(record => {
                        if (
                            selectedIds.includes(record.id) &&
                            record.lrn === active &&
                            record.status === "Borrowed"
                        ) {
                            // Mark the borrowing record as returned.
                            record.status = "Returned";
                            record.returnedAt = now.toISOString();
                            record.returnedDate = today();

                            // Put one copy back into available storage.
                            const book = books.find(
                                item =>
                                    String(item.isbn).toLowerCase() ===
                                    String(record.isbn).toLowerCase()
                            );

                            if (book) {
                                const quantity = Number(book.quantity) || 1;
                                const available =
                                    Number(book.availableCopies) || 0;

                                book.availableCopies = Math.min(
                                    quantity,
                                    available + 1
                                );
                            }

                            returnedCount++;
                        }
                    });

                    // Save both the return records and updated inventory.
                    saveRecords(records);
                    saveBooks(books);

                    msg(
                        $("returnMessage"),
                        `${returnedCount} book(s) returned successfully. Available inventory has been updated.`,
                        true
                    );

                    borrowed(active);
                    history(active);
                };
            }
        }

        rf.onsubmit = event => {
            event.preventDefault();

            const lrn = $("searchLRN").value.trim();

            if (!lrn) {
                return msg($("returnMessage"), "Enter an LRN.");
            }

            msg($("returnMessage"), "Search complete.", true);

            borrowed(lrn);
            history(lrn);
        };
    }
}

logout();
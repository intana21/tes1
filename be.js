const { PrismaClient } = require('@prisma/client');
var express = require('express');
var router = express.Router();
const { v4: uuidv4 } = require('uuid');

const prisma = new PrismaClient();

router.use(express.json());

// Array to store pending requests
const pendingRequests = [];

// Route for customer to fill a request for a specific item
router.post('/add', async (req, res) => {
  try {
    const { nama, dateStart, dateEnd, deskripsi } = req.body;
    const inventoryItem = await prisma.inventory.findFirst({
      where: { nama: nama, status: true },
    });

    if (inventoryItem && inventoryItem.status) {
      pendingRequests.push({
        inventoryId: inventoryItem.id,
        idPeminjaman: uuidv4(), 
        nama,
        dateStart,
        dateEnd,
        deskripsi,
        status: 'Menunggu',
      });

      res.json({ 
        msg: 'Request submitted.', 
        data:  pendingRequests });
    } else {
      res.status(404).json({ err: 'Inventory item not found or not available for borrowing.' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Route for admin to view the list of pending requests
router.get('/pending-request', (req, res) => {
  try {
    const pendingRequestsAdmin = pendingRequests.map(({ idPeminjaman, nama, dateStart, dateEnd, deskripsi, status }) => ({
      idPeminjaman,
      nama,
      dateStart,
      dateEnd,
      deskripsi,
      status,
    }))
    res.json(pendingRequestsAdmin);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


// route for admin to delete a request
router.delete('/:id', async (req, res) => {
  try {
      const { id } = req.params
      const deletedInventory = await prisma.peminjaman.delete({
          where: { id: parseInt(id) },
      })

      res.send({ status: true, msg: "Delete Success", data: deletedInventor })
  } catch (error) {
      res.send({
          status: false,
          error: "Failed to delete data"
      })
  }
})

// Route for admin to accept or reject a request use inventoryId
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body;

    const pendingRequestIndex = pendingRequests.findIndex((request) => request.inventoryId === parseInt(id));

    if (pendingRequestIndex !== -1) {
      const pendingRequest = pendingRequests[pendingRequestIndex];

      if (action === 'Disetujui') {
        // Accept the request
        await prisma.peminjaman.create({
          data: {
            inventoryId: pendingRequest.inventoryId,
            dateStart: pendingRequest.dateStart,
            dateEnd: pendingRequest.dateEnd,
            deskripsi: pendingRequest.deskripsi,
            status: 'Disetujui',
            inStock: false,
            outStock: true,
          },
        });

        // update the inventory status in the inventory table
        await prisma.inventory.update({
          where: { id: parseInt(id) },
          data: {
            status: false,
          },
        });

        // Remove the request from pendingRequests
        pendingRequests.splice(pendingRequestIndex, 1);

        res.json({ message: 'Request accepted and added to peminjaman.' });
      } else if (action === 'Ditolak') {
        // Reject the request
        // Remove the request from pendingRequests
        pendingRequests.splice(pendingRequestIndex, 1);
        res.json({ message: 'Request rejected successfully.' });
      } else {
        res.status(400).json({ error: 'Invalid action.' });
      }
    } else {
      res.status(404).json({ error: 'No pending request found for this inventory item.' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// route to view requests (Menunggu, Disetujui, Ditolak)
router.get('/', async (req, res) => {
  try {
    // Retrieve pending requests (Menunggu) from the array
    const pendingRequestsMapped = pendingRequests.map(({ idPeminjaman, nama, dateStart, dateEnd, deskripsi, status }) => ({
      idPeminjaman,
      nama,
      dateStart,
      dateEnd,
      deskripsi,
      status,
    }));

    // Retrieve accepted and rejected requests from the database
    const allRequests = await prisma.peminjaman.findMany();

    // Combine all requests
    const combinedRequests = [...pendingRequestsMapped, ...allRequests];

    res.json(combinedRequests);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// route for customer to fill in the inventory's condition after borrowing
router.patch('/done/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { kondisi } = req.body;

    const peminjamanItem = await prisma.peminjaman.findUnique({
      where: { id: parseInt(id) },
    });

    if (peminjamanItem) {
      // create data in the history table
      await prisma.history.create({
        data: {
          inventoryId: peminjamanItem.inventoryId,
          idPeminjaman: peminjamanItem.id,
          kondisi,
        },
      });

      // update the inventory status in the inventory table
      await prisma.inventory.update({
        where: { id: peminjamanItem.inventoryId },
        data: {
          status: true,
        },
      });

      res.json({ msg: 'Condition submitted successfully.' });
    } else {
      res.status(404).json({ err: 'Peminjaman item not found' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// route for customer to view their borrowing history
router.get('/history', async (req, res) => {
  try {
    const history = await prisma.history.findMany();
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;

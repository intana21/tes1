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
        idPeminjaman: uuidv4,
        inventoryId: inventoryItem.id,
        nama,
        dateStart,
        dateEnd,
        deskripsi,
        status: 'Menunggu',
      });

      res.json({ msg: 'Request submitted.' });
    } else {
      res.status(404).json({ err: 'Inventory item not found or not available for borrowing.' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Route for customer to check the status of their request
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Check if the request exists in the accepted requests
    const acceptedRequest = await prisma.peminjaman.findFirst({
      where: { id: parseInt(id), status: 'Disetujui' },
    });

    if (acceptedRequest) {
      res.json({ status: 'Disetujui', msg: 'Your request has been accepted.' });
    } else {
      // Check if the request exists in the pending requests
      const pendingRequest = pendingRequests.find((request) => request.inventoryId === parseInt(id));

      if (pendingRequest) {
        res.json({ status: 'Menunggu', msg: 'Your request is still pending approval.' });
      } else {
        // Check if the request exists in the rejected requests
        const rejectedRequest = await prisma.peminjaman.findFirst({
          where: { id: parseInt(id), status: 'Ditolak' },
        });

        if (rejectedRequest) {
          res.json({ status: 'Ditolak', msg: 'Your request has been rejected.' });
        } else {
          res.status(404).json({ error: 'Request not found.' });
        }
      }
    }
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Route for admin to view the list of pending requests
router.get('/validasi', (req, res) => {
  try {
    res.json(pendingRequests);
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

// Route for admin to accept or reject a request
router.patch('/validasi/:id', async (req, res) => {
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

// route for customer to view their accepted request or borrowed inventory
router.get('/current', async (req, res) => {
  try {
    const currentRequest = await prisma.peminjaman.findMany({
      where: { status: 'Disetujui' },
    });

    res.json(currentRequest);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// route for customer to fill in the inventory's condition after borrowing
router.post('/current/:id', async (req, res) => {
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

const fs = require('fs');
const pg = require('pg');
const url = require('url');

const config = {
    user: "avnadmin",
    password: "AVNS_zp-Iqm9Qy4kic0E3Agz",
    host: "kestra-record-kestra-bot.e.aivencloud.com",
    port: 12743,
    database: "defaultdb",
    ssl: {
        rejectUnauthorized: true,
        ca: `-----BEGIN CERTIFICATE-----
MIIEQTCCAqmgAwIBAgIUTyVUNiIcofy+bY+ZBm1UIAkI0NEwDQYJKoZIhvcNAQEM
BQAwOjE4MDYGA1UEAwwvN2NjN2MyNzUtZDYzZS00MmQ2LTg0MmItNWYyMGJmZmZi
MDI3IFByb2plY3QgQ0EwHhcNMjQxMTI5MTYxMzA1WhcNMzQxMTI3MTYxMzA1WjA6
MTgwNgYDVQQDDC83Y2M3YzI3NS1kNjNlLTQyZDYtODQyYi01ZjIwYmZmZmIwMjcg
UHJvamVjdCBDQTCCAaIwDQYJKoZIhvcNAQEBBQADggGPADCCAYoCggGBALb1zX3l
FKDHL+9wueKIrjFDU+lavjdiazaCj9ppUAaweQyC/JduMNdWrHTasnqjcZHHy4e9
XjnbvtzJ8wLYEm9hZXPGfb45oT1zhTlRVISve9B9WBSPYJxyTFo7TjaohSQRvL6M
WHWr2a+gvB3cAv4HC6GPG2YtusXG83033jicIh6Gyhzw0DhqHCGLJLOfGnYGQUgR
iwGwvVaI8lQELatFKCX0p4WFqQ7OvgpbkogtrSx2nIwmRiuh19wqiNyXDhn5W55q
gZ2ULiGxlv39WKMolsi47r7M62VGU6/iE+sEOIPZ/38yeKrSE3cwqSlhVm/haX9l
jwOZmi04YMsosRathE+I9HRgV+rMNYOwvY6kZ9IQLukCjXNEutHiASHzOh6gRNnN
zlQOMdYPaG4byrb506iugyOUymnRlDX0nKrlC/x3CfGqO+M9ps/kEEF9Zb+IJNOE
uMa2ZpSURdTHBx+668B9kphazvVi0JtP5xvsXTzF/Gyk4mi+O8jvInRjsQIDAQAB
oz8wPTAdBgNVHQ4EFgQUjrkh2wPYazidiEB63irX44qtvP0wDwYDVR0TBAgwBgEB
/wIBADALBgNVHQ8EBAMCAQYwDQYJKoZIhvcNAQEMBQADggGBAGqg9QI1eoxbv3rh
N++dcbfhS48Gy9hvYBucBi3TUHarmxzrmXROI8fgmX2lF5WgUvF24O9lzpwl4OgU
H5ImlzDCb9NaPFC8bua7KQi8xuMce0V+6UPMltc5D8ct+tyQPPOVITUvvCDOFYre
wnsCPW9wlW+y7fgRS7Dvpd4pl2YioFKK6mVgdPgDQfUisJnD7DNUmqyN6igjxyi7
C59jVPxn+/mtFau22Bz1KYYSrshztq5iSzDYJFPr6WpggLXiYAnUMlNDOOYSz7wu
Xl1B8KIt/wIKM2Rjrh3O4nWBxjed2M3nr1sGIG+nC/on2HalEiYIrzCBG4usZBWa
3JZtngbtEmwjSn1P6HS69ceNTVMczh0Nhme3LdkqXyZqrfka3jRyqDqnY25kFHyd
zRSVx8UzrEHt+OGBwAdp5+Vu62CyJrhbCWjyIyF4EgOebjXUZJo+kcVBCa7W7+D2
gwAloO/B/ihjjZ668t2aDC0NlXQuTUQMiiBwjhqfHdnits6YVg==
-----END CERTIFICATE-----`,
    },
};
async function getUrl(phone_no, fileName) {
    const client = new pg.Client(config);
    try {
        await client.connect();
        const query = `
            SELECT files.original_filename, files.s3_url 
            FROM files 
            JOIN users ON files.user_id = users.user_id 
            WHERE users.phone_number = $1;
        `;
        const result = await client.query(query, [phone_no]);

        // Filter for the specified fileName and return the corresponding s3_url
        const file = result.rows.find(row => row.original_filename === fileName);
        if (file) {
            return file.s3_url; // Return the s3_url if a match is found
        } else {
            return null; // Return null if no match is found
        }
    } catch (err) {
        console.error("Error querying the database:", err);
        throw err;
    } finally {
        await client.end();
    }
}

module.exports = { getUrl };

async function getList(phone_no) {
    const client = new pg.Client(config);
    try {
        await client.connect();
        const query = `
            SELECT original_filename 
            FROM files 
            JOIN users ON files.user_id = users.user_id 
            WHERE users.phone_number = $1;
        `;
        const result = await client.query(query, [phone_no]);
        return result.rows.map(row => row.original_filename);
    } catch (err) {
        console.error("Error querying the database:", err);
        throw err;
    } finally {
        await client.end();
    }
}

module.exports = { getList,getUrl };

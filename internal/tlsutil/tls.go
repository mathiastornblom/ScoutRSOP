// Package tlsutil provides helpers for managing TLS certificates for the ScoutRSOP server.
package tlsutil

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"fmt"
	"math/big"
	"net"
	"os"
	"time"
)

// CertInfo describes a loaded certificate.
type CertInfo struct {
	Subject   string    `json:"subject"`
	Issuer    string    `json:"issuer"`
	DNSNames  []string  `json:"dnsNames"`
	IPs       []string  `json:"ips"`
	NotBefore time.Time `json:"notBefore"`
	NotAfter  time.Time `json:"notAfter"`
	SelfSigned bool     `json:"selfSigned"`
	DaysLeft  int       `json:"daysLeft"`
}

// InspectCertFile reads a PEM certificate file and returns metadata.
func InspectCertFile(certPath string) (*CertInfo, error) {
	data, err := os.ReadFile(certPath)
	if err != nil {
		return nil, err
	}
	return InspectCertPEM(data)
}

// InspectCertPEM parses PEM bytes and returns certificate metadata.
func InspectCertPEM(certPEM []byte) (*CertInfo, error) {
	block, _ := pem.Decode(certPEM)
	if block == nil {
		return nil, fmt.Errorf("no PEM block found in certificate")
	}
	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("parse certificate: %w", err)
	}

	info := &CertInfo{
		Subject:    cert.Subject.CommonName,
		Issuer:     cert.Issuer.CommonName,
		DNSNames:   cert.DNSNames,
		NotBefore:  cert.NotBefore,
		NotAfter:   cert.NotAfter,
		SelfSigned: cert.Issuer.CommonName == cert.Subject.CommonName,
		DaysLeft:   int(time.Until(cert.NotAfter).Hours() / 24),
	}
	for _, ip := range cert.IPAddresses {
		info.IPs = append(info.IPs, ip.String())
	}
	return info, nil
}

// ValidateKeyPair checks that certPEM and keyPEM form a valid key pair.
func ValidateKeyPair(certPEM, keyPEM []byte) error {
	_, err := tls.X509KeyPair(certPEM, keyPEM)
	if err != nil {
		return fmt.Errorf("invalid cert/key pair: %w", err)
	}
	return nil
}

// SavePEMFiles writes cert and key PEM to the given file paths (mode 0600).
func SavePEMFiles(certPath, keyPath string, certPEM, keyPEM []byte) error {
	if err := ValidateKeyPair(certPEM, keyPEM); err != nil {
		return err
	}
	if err := os.WriteFile(certPath, certPEM, 0o600); err != nil {
		return fmt.Errorf("write cert: %w", err)
	}
	if err := os.WriteFile(keyPath, keyPEM, 0o600); err != nil {
		return fmt.Errorf("write key: %w", err)
	}
	return nil
}

// GenerateSelfSigned creates a self-signed ECDSA certificate valid for the given hostnames/IPs.
// Returns certPEM, keyPEM.
func GenerateSelfSigned(hosts []string, validDays int) ([]byte, []byte, error) {
	if validDays <= 0 {
		validDays = 825 // Apple/browser limit
	}

	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return nil, nil, fmt.Errorf("generate key: %w", err)
	}

	serial, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		return nil, nil, fmt.Errorf("generate serial: %w", err)
	}

	cn := "ScoutRSOP"
	if len(hosts) > 0 {
		cn = hosts[0]
	}

	tmpl := &x509.Certificate{
		SerialNumber: serial,
		Subject:      pkix.Name{CommonName: cn, Organization: []string{"ScoutRSOP"}},
		NotBefore:    time.Now().Add(-time.Minute), // small clock-skew buffer
		NotAfter:     time.Now().Add(time.Duration(validDays) * 24 * time.Hour),
		KeyUsage:     x509.KeyUsageDigitalSignature | x509.KeyUsageCertSign,
		ExtKeyUsage:  []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		IsCA:         true,
		BasicConstraintsValid: true,
	}
	for _, h := range hosts {
		if ip := net.ParseIP(h); ip != nil {
			tmpl.IPAddresses = append(tmpl.IPAddresses, ip)
		} else {
			tmpl.DNSNames = append(tmpl.DNSNames, h)
		}
	}

	certDER, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &key.PublicKey, key)
	if err != nil {
		return nil, nil, fmt.Errorf("sign certificate: %w", err)
	}

	certPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: certDER})

	keyDER, err := x509.MarshalECPrivateKey(key)
	if err != nil {
		return nil, nil, fmt.Errorf("marshal key: %w", err)
	}
	keyPEM := pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: keyDER})

	return certPEM, keyPEM, nil
}
